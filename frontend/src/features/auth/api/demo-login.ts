import type { UserRole } from "@/entities/session";

// Временные учетные записи для демонстрации до подключения бэкенда.
const demoAccounts = [
  { login: "admin", password: "admin123", role: "admin" },
  { login: "teacher", password: "teacher123", role: "teacher" },
  { login: "student", password: "student123", role: "student" },
] satisfies { login: string; password: string; role: UserRole }[];

export function getDemoAccountRole(login: string, password: string): UserRole | null {
  const account = demoAccounts.find(
    (account) => account.login === login.trim() && account.password === password,
  );

  return account?.role ?? null;
}
