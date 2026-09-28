import {
  BarChart3,
  BookOpen,
  CalendarClock,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  Activity,
  FileText,
  Server,
  ShieldCheck,
  DatabaseBackup,
  PackageCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
export type NavRole = "admin" | "teacher" | "student";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
}

export const roleLabels: Record<NavRole, string> = {
  admin: "Администратор",
  teacher: "Преподаватель",
  student: "Обучаемый",
};

export const navigation: Record<NavRole, NavItem[]> = {
  teacher: [
    { key: "overview", label: "Обзор", icon: LayoutDashboard, path: "/teacher" },
    { key: "lessons", label: "Занятия", icon: CalendarClock, path: "/teacher/lessons" },
    { key: "scenarios", label: "Сценарии", icon: ClipboardList, path: "/teacher/scenarios" },
    { key: "groups", label: "Группы", icon: Users, path: "/teacher/groups" },
    { key: "students", label: "Обучаемые", icon: GraduationCap, path: "/teacher/students" },
    { key: "analytics", label: "Аналитика", icon: BarChart3, path: "/teacher/analytics" },
    { key: "materials", label: "Материалы", icon: BookOpen, path: "/teacher/materials" },
  ],
  student: [
    { key: "overview", label: "Обзор", icon: LayoutDashboard, path: "/student" },
    { key: "results", label: "Мои результаты", icon: ClipboardList, path: "/student/results" },
    { key: "progress", label: "Прогресс", icon: LineChart, path: "/student/progress" },
    { key: "materials", label: "Материалы", icon: BookOpen, path: "/student/materials" },
  ],
  admin: [
    { key: "overview", label: "Обзор", icon: LayoutDashboard, path: "/admin" },
    { key: "monitoring", label: "Мониторинг", icon: Activity, path: "/admin/monitoring" },
    { key: "users", label: "Пользователи", icon: Users, path: "/admin/users" },
    { key: "reports", label: "Отчёты", icon: FileText, path: "/admin/reports" },
    { key: "services", label: "Сервисы", icon: Server, path: "/admin/services" },
    { key: "backups", label: "Резервные копии", icon: DatabaseBackup, path: "/admin/backups" },
    { key: "updates", label: "Обновления", icon: PackageCheck, path: "/admin/updates" },
    { key: "security", label: "Безопасность", icon: ShieldCheck, path: "/admin/security" },
  ],
};

export const extraTitles: { path: string; title: string }[] = [
  { path: "/teacher/attempts", title: "Разбор попытки" },
  { path: "/student/attempts", title: "Разбор попытки" },
  { path: "/student/arm", title: "Рабочее место" },
  { path: "/teacher/monitor", title: "Монитор занятия" },
  { path: "/teacher/lessons", title: "Занятия" },
  { path: "/teacher/scenarios", title: "Сценарии" },
  { path: "/admin", title: "Администрирование" },
];

const titledPaths = [
  ...Object.values(navigation).flat().map((item) => ({ path: item.path, title: item.label })),
  ...extraTitles,
].sort((first, second) => second.path.length - first.path.length);

export function matchRouteTitle(pathname: string): string | undefined {
  return titledPaths.find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  )?.title;
}
