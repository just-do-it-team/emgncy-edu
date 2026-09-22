import { create } from "zustand";
import type { LaunchContext } from "./types";

export const STUDENT_API_ENABLED =
  import.meta.env.VITE_STUDENT_API_ENABLED !== "false";
export const STUDENT_API_URL = (
  import.meta.env.VITE_ARM_API_URL || "/student-api"
).replace(/\/$/, "");
export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const identityKey = "student-api-user-id";
export const useTrainingIdentity = create<{
  userId: string;
  setUserId: (id: string) => void;
}>((set) => ({
  userId:
    sessionStorage.getItem(identityKey) ||
    import.meta.env.VITE_STUDENT_ID ||
    "",
  setUserId: (id) => {
    sessionStorage.setItem(identityKey, id);
    set({ userId: id });
  },
}));
const contextKey = (userId: string, sessionId: string) =>
  `student-api:${STUDENT_API_URL}:${userId}:session:${sessionId}`;
export function saveLaunchContext(context: LaunchContext) {
  localStorage.setItem(
    contextKey(context.userId, context.sessionId),
    JSON.stringify(context),
  );
}
export function loadLaunchContext(
  userId: string,
  sessionId: string,
): LaunchContext | null {
  try {
    const item = JSON.parse(
      localStorage.getItem(contextKey(userId, sessionId)) || "null",
    ) as LaunchContext | null;
    return item &&
      item.userId === userId &&
      item.sessionId === sessionId &&
      isUuid(item.workspaceId) &&
      (item.mode === "DDS" || item.mode === "ARM112")
      ? item
      : null;
  } catch {
    return null;
  }
}
export function startKey(userId: string, assignmentId: string) {
  const storageKey = `student-api:${STUDENT_API_URL}:${userId}:start:${assignmentId}`;
  const existing = localStorage.getItem(storageKey);
  const key = existing || crypto.randomUUID();
  // Persist before POST so a lost response can be replayed after reload.
  localStorage.setItem(storageKey, key);
  return { key, clear: () => localStorage.removeItem(storageKey) };
}
