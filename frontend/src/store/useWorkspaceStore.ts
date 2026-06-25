import { create } from "zustand";

export interface Project {
  id: string;
  title: string;
  prompt: string;
  content: string;
}

export interface TeamWorkspace {
  id: string;
  name: string;
}

export interface UserProfile {
  id: string;
  email: string;
  created_at: string;
}

export interface CanonCharacter {
  id: string;
  slug: string;
  display_name: string;
  visual_variant_label?: string;
  outfit_summary?: string;
  face_marks_json?: unknown[];
  auto_discovered?: boolean;
}

export interface CanonLocation {
  id?: string;
  slug: string;
  display_name: string;
  env_style_tags?: string[];
}

export type TranslationMode = "none" | "vi-to-en" | "en-to-vi";

interface WorkspaceState {
  // Theme & User
  isDark: boolean;
  userEmail: string;
  userProfile: UserProfile | null;
  
  // Projects & Teams
  projects: Project[];
  selectedProject: Project | null;
  teams: TeamWorkspace[];
  selectedTeamId: string;
  newTeamName: string;
  teamToken: string;
  isCreatingTeam: boolean;
  
  // Modals & Panels
  isProfileOpen: boolean;
  isPersonalizeOpen: boolean;
  isProjectSettingsOpen: boolean;
  isCanonModalOpen: boolean;
  isExportPanelOpen: boolean;
  
  // Settings/Preferences
  modelName: string;
  creativity: string;
  language: "vietnamese" | "english";
  minWords: number;
  maxWords: number;
  lengthOption: string;
  personalHfKeyActive: boolean;
  
  // Export Settings
  exportFormatChoice: "md" | "pdf" | "docx";
  exportTranslationMode: TranslationMode;
  exportingFormat: "md" | "pdf" | "docx" | null;
  
  // Canon Data
  canonCharacters: CanonCharacter[];
  canonLocations: CanonLocation[];
  isLoadingCanon: boolean;
  activeCanonTab: "characters" | "locations";
  
  // Character/Location Form (temp state for canon modals)
  newCharDisplayName: string;
  selectedCharForVariant: CanonCharacter | null;
  outfitSummary: string;
  faceMarksInput: string;
  newLocDisplayName: string;
  newLocEnvTags: string;
  
  // Setters
  setIsDark: (isDark: boolean) => void;
  setUserEmail: (email: string) => void;
  setUserProfile: (profile: UserProfile | null) => void;
  setProjects: (projects: Project[] | ((prev: Project[]) => Project[])) => void;
  setSelectedProject: (project: Project | null | ((prev: Project | null) => Project | null)) => void;
  setTeams: (teams: TeamWorkspace[] | ((prev: TeamWorkspace[]) => TeamWorkspace[])) => void;
  setSelectedTeamId: (id: string | ((prev: string) => string)) => void;
  setNewTeamName: (name: string) => void;
  setTeamToken: (token: string) => void;
  setIsCreatingTeam: (isCreating: boolean) => void;
  setIsProfileOpen: (isOpen: boolean) => void;
  setIsPersonalizeOpen: (isOpen: boolean) => void;
  setIsProjectSettingsOpen: (isOpen: boolean) => void;
  setIsCanonModalOpen: (isOpen: boolean) => void;
  setIsExportPanelOpen: (isOpen: boolean) => void;
  setModelName: (name: string) => void;
  setCreativity: (creativity: string) => void;
  setLanguage: (lang: "vietnamese" | "english") => void;
  setMinWords: (words: number) => void;
  setMaxWords: (words: number) => void;
  setLengthOption: (option: string) => void;
  setPersonalHfKeyActive: (active: boolean) => void;
  setExportFormatChoice: (choice: "md" | "pdf" | "docx") => void;
  setExportTranslationMode: (mode: TranslationMode) => void;
  setExportingFormat: (format: "md" | "pdf" | "docx" | null) => void;
  
  // Canon Actions
  setCanonCharacters: (chars: CanonCharacter[]) => void;
  setCanonLocations: (locs: CanonLocation[]) => void;
  setIsLoadingCanon: (isLoading: boolean) => void;
  setActiveCanonTab: (tab: "characters" | "locations") => void;
  
  // Form Setters
  setNewCharDisplayName: (name: string) => void;
  setSelectedCharForVariant: (char: CanonCharacter | null) => void;
  setOutfitSummary: (summary: string) => void;
  setFaceMarksInput: (input: string) => void;
  setNewLocDisplayName: (name: string) => void;
  setNewLocEnvTags: (tags: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  // Theme & User
  isDark: true,
  userEmail: "",
  userProfile: null,
  
  // Projects & Teams
  projects: [],
  selectedProject: null,
  teams: [],
  selectedTeamId: "",
  newTeamName: "",
  teamToken: "",
  isCreatingTeam: false,
  
  // Modals & Panels
  isProfileOpen: false,
  isPersonalizeOpen: false,
  isProjectSettingsOpen: false,
  isCanonModalOpen: false,
  isExportPanelOpen: false,
  
  // Settings/Preferences
  modelName: "Qwen/Qwen2.5-72B-Instruct",
  creativity: "Balanced",
  language: "vietnamese",
  minWords: 1000,
  maxWords: 2000,
  lengthOption: "1000",
  personalHfKeyActive: false,
  
  // Export Settings
  exportFormatChoice: "md",
  exportTranslationMode: "none",
  exportingFormat: null,
  
  // Canon Data
  canonCharacters: [],
  canonLocations: [],
  isLoadingCanon: false,
  activeCanonTab: "characters",
  
  // Form states
  newCharDisplayName: "",
  selectedCharForVariant: null,
  outfitSummary: "",
  faceMarksInput: "",
  newLocDisplayName: "",
  newLocEnvTags: "",
  
  // Setters
  setIsDark: (isDark) => set({ isDark }),
  setUserEmail: (userEmail) => set({ userEmail }),
  setUserProfile: (userProfile) => set({ userProfile }),
  
  setProjects: (projects) => set((state) => ({
    projects: typeof projects === "function" ? projects(state.projects) : projects
  })),
  setSelectedProject: (selectedProject) => set((state) => ({
    selectedProject: typeof selectedProject === "function" ? selectedProject(state.selectedProject) : selectedProject
  })),
  setTeams: (teams) => set((state) => ({
    teams: typeof teams === "function" ? teams(state.teams) : teams
  })),
  setSelectedTeamId: (selectedTeamId) => set((state) => ({
    selectedTeamId: typeof selectedTeamId === "function" ? selectedTeamId(state.selectedTeamId) : selectedTeamId
  })),
  setNewTeamName: (newTeamName) => set({ newTeamName }),
  setTeamToken: (teamToken) => set({ teamToken }),
  setIsCreatingTeam: (isCreatingTeam) => set({ isCreatingTeam }),
  
  setIsProfileOpen: (isProfileOpen) => set({ isProfileOpen }),
  setIsPersonalizeOpen: (isPersonalizeOpen) => set({ isPersonalizeOpen }),
  setIsProjectSettingsOpen: (isProjectSettingsOpen) => set({ isProjectSettingsOpen }),
  setIsCanonModalOpen: (isCanonModalOpen) => set({ isCanonModalOpen }),
  setIsExportPanelOpen: (isExportPanelOpen) => set({ isExportPanelOpen }),
  
  setModelName: (modelName) => set({ modelName }),
  setCreativity: (creativity) => set({ creativity }),
  setLanguage: (language) => set({ language }),
  setMinWords: (minWords) => set({ minWords }),
  setMaxWords: (maxWords) => set({ maxWords }),
  setLengthOption: (lengthOption) => set({ lengthOption }),
  setPersonalHfKeyActive: (personalHfKeyActive) => set({ personalHfKeyActive }),
  
  setExportFormatChoice: (exportFormatChoice) => set({ exportFormatChoice }),
  setExportTranslationMode: (exportTranslationMode) => set({ exportTranslationMode }),
  setExportingFormat: (exportingFormat) => set({ exportingFormat }),
  
  setCanonCharacters: (canonCharacters) => set({ canonCharacters }),
  setCanonLocations: (canonLocations) => set({ canonLocations }),
  setIsLoadingCanon: (isLoadingCanon) => set({ isLoadingCanon }),
  setActiveCanonTab: (activeCanonTab) => set({ activeCanonTab }),
  
  setNewCharDisplayName: (newCharDisplayName) => set({ newCharDisplayName }),
  setSelectedCharForVariant: (selectedCharForVariant) => set({ selectedCharForVariant }),
  setOutfitSummary: (outfitSummary) => set({ outfitSummary }),
  setFaceMarksInput: (faceMarksInput) => set({ faceMarksInput }),
  setNewLocDisplayName: (newLocDisplayName) => set({ newLocDisplayName }),
  setNewLocEnvTags: (newLocEnvTags) => set({ newLocEnvTags }),
}));
