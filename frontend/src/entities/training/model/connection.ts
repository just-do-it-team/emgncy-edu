import type { ArmMode, Assignment, LaunchContext } from "./types";

export const STUDENT_API_ENABLED =
  import.meta.env.VITE_STUDENT_API_ENABLED !== "false";
export const STUDENT_API_URL = (
  import.meta.env.VITE_ARM_API_URL || "/student-api"
).replace(/\/$/, "");
export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function assignmentLaunchContext(
  assignment: Assignment,
  userId: string,
  mode?: ArmMode,
): LaunchContext | null {
  const session = assignment.active_session;
  if (
    assignment.participant.user_id !== userId ||
    !session ||
    !["CREATED", "RUNNING"].includes(session.status)
  ) {
    return null;
  }
  return {
    userId,
    sessionId: session.session_id,
    workspaceId: session.workspace_id,
    assignmentId: assignment.id,
    mode: mode ?? (assignment.participant.position_code ? "DDS" : "ARM112"),
    positionCode: assignment.participant.position_code,
    title: assignment.scenario.name,
  };
}

const startStorageKey = (userId: string, assignmentId: string) =>
  `student-api:${STUDENT_API_URL}:${userId}:start:${assignmentId}`;
export function pendingStartKey(userId: string, assignmentId: string) {
  try {
    return localStorage.getItem(startStorageKey(userId, assignmentId));
  } catch {
    return null;
  }
}
export function clearStartKey(userId: string, assignmentId: string) {
  try {
    localStorage.removeItem(startStorageKey(userId, assignmentId));
  } catch {
    // Storage cleanup must not prevent opening a server-confirmed attempt.
  }
}
export function startKey(userId: string, assignmentId: string) {
  const storageKey = startStorageKey(userId, assignmentId);
  const existing = localStorage.getItem(storageKey);
  const key = existing || crypto.randomUUID();
  // Persist before POST so a lost response can be replayed after reload.
  localStorage.setItem(storageKey, key);
  return { key, clear: () => clearStartKey(userId, assignmentId) };
}
