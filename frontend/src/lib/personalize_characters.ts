export type PersonalizeCharacterProfile = {
  id: string;
  name: string;
  aliases: string[];
  appearance: string;
  personality: string;
  notes: string;
  updatedAt: string;
};

export type CanonCharacterProfile = {
  id?: string;
  slug: string;
  display_name: string;
  visual_variant_label?: string;
  outfit_summary?: string;
  face_marks_json?: unknown[];
};

export type CanonLocationProfile = {
  id?: string;
  slug: string;
  display_name: string;
  env_style_tags?: string[];
};

const STORAGE_KEY = "personalize_character_profiles_v1";

function safeParseProfiles(raw: string | null): PersonalizeCharacterProfile[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
        name: typeof item.name === "string" ? item.name : "",
        aliases: Array.isArray(item.aliases) ? item.aliases.filter((x: unknown) => typeof x === "string") : [],
        appearance: typeof item.appearance === "string" ? item.appearance : "",
        personality: typeof item.personality === "string" ? item.personality : "",
        notes: typeof item.notes === "string" ? item.notes : "",
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
      }))
      .filter((item) => item.name.trim());
  } catch {
    return [];
  }
}

export function getPersonalizeCharacterProfiles(): PersonalizeCharacterProfile[] {
  if (typeof window === "undefined") return [];
  return safeParseProfiles(localStorage.getItem(STORAGE_KEY));
}

export function setPersonalizeCharacterProfiles(profiles: PersonalizeCharacterProfile[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function createEmptyCharacterProfile(): PersonalizeCharacterProfile {
  return {
    id: crypto.randomUUID(),
    name: "",
    aliases: [],
    appearance: "",
    personality: "",
    notes: "",
    updatedAt: new Date().toISOString(),
  };
}

export function parseAliasInput(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === index);
}

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugToPhrase(slug: string): string {
  return slug.replace(/[_-]+/g, " ").trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    if (!clean) continue;
    const key = normalizeForMatch(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function containsNameLike(text: string, name: string): boolean {
  const normalizedText = normalizeForMatch(text);
  const normalizedName = normalizeForMatch(name.trim());
  if (!normalizedText || !normalizedName) return false;

  // Names that contain spaces are safer to match as phrases. One-word names still need boundaries.
  const pattern = new RegExp(`(^|[^a-z0-9_])${escapeRegExp(normalizedName)}([^a-z0-9_]|$)`, "i");
  return pattern.test(normalizedText);
}

function buildHaystack(texts: Array<string | undefined | null>): string {
  return texts.filter(Boolean).join("\n\n");
}

export function findMentionedCharacterProfiles(
  profiles: PersonalizeCharacterProfile[],
  ...texts: Array<string | undefined | null>
): PersonalizeCharacterProfile[] {
  const haystack = buildHaystack(texts);
  if (!haystack.trim()) return [];
  return profiles.filter((profile) => {
    const names = [profile.name, ...profile.aliases].map((x) => x.trim()).filter(Boolean);
    return names.some((name) => containsNameLike(haystack, name));
  });
}

export function findMentionedCanonCharacterProfiles(
  profiles: CanonCharacterProfile[],
  ...texts: Array<string | undefined | null>
): CanonCharacterProfile[] {
  const haystack = buildHaystack(texts);
  if (!haystack.trim()) return [];
  return profiles.filter((profile) => {
    const names = uniqueStrings([
      profile.display_name,
      profile.slug,
      slugToPhrase(profile.slug),
    ]);
    return names.some((name) => containsNameLike(haystack, name));
  });
}

export function findMentionedLocationProfiles(
  profiles: CanonLocationProfile[],
  ...texts: Array<string | undefined | null>
): CanonLocationProfile[] {
  const haystack = buildHaystack(texts);
  if (!haystack.trim()) return [];
  return profiles.filter((profile) => {
    const names = uniqueStrings([
      profile.display_name,
      profile.slug,
      slugToPhrase(profile.slug),
    ]);
    return names.some((name) => containsNameLike(haystack, name));
  });
}

export function buildCharacterPersonaContext(profiles: PersonalizeCharacterProfile[]): string {
  const active = profiles.filter((profile) => profile.name.trim());
  if (!active.length) return "";

  const blocks = active.map((profile, index) => {
    const lines = [`${index + 1}. ${profile.name.trim()}`];
    if (profile.aliases.length) lines.push(`Aliases: ${profile.aliases.join(", ")}`);
    if (profile.appearance.trim()) lines.push(`Appearance: ${profile.appearance.trim()}`);
    if (profile.personality.trim()) lines.push(`Personality: ${profile.personality.trim()}`);
    if (profile.notes.trim()) lines.push(`Notes/continuity: ${profile.notes.trim()}`);
    return lines.join("\n");
  });

  return [
    "LOCKED PERSONAL CHARACTER PROFILES",
    "Use the following profile facts whenever the referenced character appears. Keep names, appearance, personality, and continuity consistent unless the user explicitly changes them.",
    blocks.join("\n\n"),
  ].join("\n");
}

export function buildCanonCharacterContext(profiles: CanonCharacterProfile[]): string {
  const active = profiles.filter((profile) => profile.display_name.trim() || profile.slug.trim());
  if (!active.length) return "";

  const blocks = active.map((profile, index) => {
    const displayName = profile.display_name.trim() || slugToPhrase(profile.slug);
    const lines = [`${index + 1}. ${displayName}`];
    if (profile.slug.trim()) lines.push(`Canon slug: ${profile.slug.trim()}`);
    if (profile.outfit_summary?.trim()) {
      lines.push(`Appearance/outfit: ${profile.outfit_summary.trim()}`);
    }
    if (Array.isArray(profile.face_marks_json) && profile.face_marks_json.length > 0) {
      lines.push(`Face/identity marks: ${JSON.stringify(profile.face_marks_json)}`);
    }
    if (profile.visual_variant_label?.trim()) {
      lines.push(`Visual variant: ${profile.visual_variant_label.trim()}`);
    }
    return lines.join("\n");
  });

  return [
    "LOCKED PROJECT CANON CHARACTERS",
    "Use these project-specific canon facts whenever the referenced character appears. Do not rename the character or contradict saved visual details.",
    blocks.join("\n\n"),
  ].join("\n");
}

export function buildLocationContext(profiles: CanonLocationProfile[]): string {
  const active = profiles.filter((profile) => profile.display_name.trim() || profile.slug.trim());
  if (!active.length) return "";

  const blocks = active.map((profile, index) => {
    const displayName = profile.display_name.trim() || slugToPhrase(profile.slug);
    const lines = [`${index + 1}. ${displayName}`];
    if (profile.slug.trim()) lines.push(`Canon slug: ${profile.slug.trim()}`);
    if (Array.isArray(profile.env_style_tags) && profile.env_style_tags.length > 0) {
      lines.push(`Environment/style tags: ${profile.env_style_tags.join(", ")}`);
    }
    return lines.join("\n");
  });

  return [
    "LOCKED PROJECT CANON LOCATIONS / SETTINGS",
    "Use these project-specific location facts whenever the referenced place appears. Keep atmosphere, environment, and setting details consistent unless the user explicitly changes them.",
    blocks.join("\n\n"),
  ].join("\n");
}

export function buildPersonalizedContext(input: {
  personalCharacters?: PersonalizeCharacterProfile[];
  canonCharacters?: CanonCharacterProfile[];
  locations?: CanonLocationProfile[];
}): string {
  const sections = [
    buildCharacterPersonaContext(input.personalCharacters || []),
    buildCanonCharacterContext(input.canonCharacters || []),
    buildLocationContext(input.locations || []),
  ].filter((section) => section.trim());

  if (!sections.length) return "";

  return [
    "PERSONALIZED PROJECT CONTEXT",
    "The following facts were automatically matched from the user's saved character/location configuration. Treat them as high-priority continuity constraints.",
    sections.join("\n\n"),
  ].join("\n");
}
