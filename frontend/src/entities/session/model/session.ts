import { create } from "zustand";
import { clearToken, setToken } from "./token";

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

interface SessionState {
  profile: SessionProfile | null;
  expiresAt: number | null;
  signIn: (params: SignInParams) => void;
  logout: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  profile: null,
  expiresAt: null,
  signIn: ({ profile, token, expiresAt }) => {
    setToken(token);
    set({ profile, expiresAt });
  },
  logout: () => {
    clearToken();
    set({ profile: null, expiresAt: null });
  },
}));
