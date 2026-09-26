import type { NavRole } from "./navigation";

const roleRoots: Record<NavRole, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/student",
};

const INTERNAL_ORIGIN = "http://app.internal";
const FIRST_PRINTABLE_CODE = 0x20;

export function safeReturnPath(candidate: unknown, role: NavRole): string | null {
  if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return null;
  }
  if ([...candidate].some((char) => char === "\\" || char.charCodeAt(0) < FIRST_PRINTABLE_CODE)) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(candidate, INTERNAL_ORIGIN);
  } catch {
    return null;
  }

  const root = roleRoots[role];

  if (url.origin !== INTERNAL_ORIGIN) return null;
  if (url.pathname !== root && !url.pathname.startsWith(`${root}/`)) return null;

  return `${url.pathname}${url.search}`;
}
