export type ProjectCreateRequest = {
  title: string;
  prompt: string;
  language: "vietnamese" | "english";
  modelName: string;
  minWords?: number;
  maxWords?: number;
  voice?: string;
  personaContext?: string;
};

export type ProjectContinueRequest = {
  prompt: string;
  language: "vietnamese" | "english";
  modelName: string;
  minWords?: number;
  maxWords?: number;
  voice?: string;
  personaContext?: string;
};

export type ChangePasswordRequest = {
  currentPassword: string;
  newPassword: string;
};

export type ResetPasswordRequest = {
  token: string;
  newPassword: string;
};

export type UserProfileResponse = {
  id: string;
  email: string;
  created_at?: string;
};

export type UserProfile = {
  id: string;
  email: string;
  createdAt: string;
};

export function toProjectCreateApiPayload(request: ProjectCreateRequest) {
  const payload: Record<string, unknown> = {
    title: request.title,
    prompt: request.prompt,
    language: request.language,
    model_name: request.modelName,
    min_words: request.minWords,
    max_words: request.maxWords,
  };
  if (request.voice) payload.voice = request.voice;
  if (request.personaContext) payload.persona_context = request.personaContext;
  return payload;
}

export function toProjectContinueApiPayload(request: ProjectContinueRequest) {
  const payload: Record<string, unknown> = {
    prompt: request.prompt,
    language: request.language,
    model_name: request.modelName,
    min_words: request.minWords,
    max_words: request.maxWords,
  };
  if (request.voice) payload.voice = request.voice;
  if (request.personaContext) payload.persona_context = request.personaContext;
  return payload;
}


export function toChangePasswordApiPayload(request: ChangePasswordRequest) {
  return {
    current_password: request.currentPassword,
    new_password: request.newPassword,
  };
}

export function toResetPasswordApiPayload(request: ResetPasswordRequest) {
  return {
    token: request.token,
    new_password: request.newPassword,
  };
}

export function fromUserProfileApiResponse(response: UserProfileResponse): UserProfile {
  return {
    id: response.id,
    email: response.email,
    createdAt: response.created_at || "",
  };
}
