import { create } from "zustand";

export type UserRole = "admin" | "teacher" | "student";

// Временные учетные записи для демонстрации до подключения бэкенда.
const demoAccounts = [
  { login: "admin", password: "admin123", role: "admin" },
  { login: "teacher", password: "teacher123", role: "teacher" },
  { login: "student", password: "student123", role: "student" },
] satisfies { login: string; password: string; role: UserRole }[];

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

interface AuthState {
  role: UserRole | null;
  login: (login: string, password: string) => boolean;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  role: getSessionRole(),
  logout: () => {
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      // Выход доступен и при отключенном хранилище браузера.
    }

    set({ role: null });
  },
  login: (login, password) => {
    const account = demoAccounts.find(
      (account) => account.login === login.trim() && account.password === password,
    );

    if (!account) return false;

    try {
      sessionStorage.setItem(sessionKey, account.role);
    } catch {
      // При недоступном хранилище вход действует до обновления страницы.
    }

    set({ role: account.role });
    return true;
  },
}));
