import { create } from "zustand";
import { clearToken, setToken, storedToken } from "./token";

export type UserRole = "admin" | "teacher" | "student";

export interface SessionProfile {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface SignInParams {
  profile: SessionProfile;
  token: string;
  expiresAt: number;
}

/**
 * restoring — токен из хранилища вкладки проверяется сервером, маршруты ждут и не уводят на вход;
 * offline — сервис авторизации не ответил, токен сохранён до повторной проверки.
 */
export type SessionStatus = "restoring" | "offline" | "ready";

interface SessionState {
  profile: SessionProfile | null;
  expiresAt: number | null;
  status: SessionStatus;
  signIn: (params: SignInParams) => void;
  setStatus: (status: SessionStatus) => void;
  logout: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  profile: null,
  expiresAt: null,
  status: storedToken() === null ? "ready" : "restoring",
  signIn: ({ profile, token, expiresAt }) => {
    setToken(token, expiresAt);
    set({ profile, expiresAt, status: "ready" });
  },
  setStatus: (status) => set({ status }),
  logout: () => {
    clearToken();
    set({ profile: null, expiresAt: null, status: "ready" });
  },
}));
