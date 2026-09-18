import type { UserRole } from "@/shared/model/auth";

export enum RouteNames {
  LOGIN = "/login",
  ADMIN = "/admin",
  TEACHER = "/teacher",
  STUDENT = "/student",
  NAVIGATE = "*",
}

export const routes: { path: RouteNames; role: UserRole }[] = [
  { path: RouteNames.ADMIN, role: "admin" },
  { path: RouteNames.TEACHER, role: "teacher" },
  { path: RouteNames.STUDENT, role: "student" },
];
