import { create } from "zustand";

export type UserRole = "admin" | "teacher" | "student";

const sessionKey = "emgncy-edu-demo-role";

function getSessionRole(): UserRole | null {
  try {
    const role = sessionStorage.getItem(sessionKey);
    return role === "admin" || role === "teacher" || role === "student"
      ? role
      : null;
  } catch {
    return null;
  }
}

interface SessionState {
  role: UserRole | null;
  setRole: (role: UserRole) => void;
  logout: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  role: getSessionRole(),
  logout: () => {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      // Выход доступен и при отключенном хранилище браузера.
    }

    set({ role: null });
  },
  setRole: (role) => {
    try {
      sessionStorage.setItem(sessionKey, role);
    } catch {
      // При недоступном хранилище вход действует до обновления страницы.
    }

    set({ role });
  },
}));
