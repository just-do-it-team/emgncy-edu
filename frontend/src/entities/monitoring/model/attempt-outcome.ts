import type { MonitoredSession, TeacherAssignment } from "@/shared/api";
import { ABORTED_SESSION_STATUS, COMPLETED_SESSION_STATUS, sessionStatusLabels } from "./labels";

export type AttemptResultKind = "passed" | "failed" | "aborted" | "other";

export type AttemptDeadline = "on_time" | "late" | "none";

export function attemptResultKind(session: MonitoredSession): AttemptResultKind {
  if (session.status === ABORTED_SESSION_STATUS) return "aborted";
  if (session.status !== COMPLETED_SESSION_STATUS || session.passed === null) return "other";

  return session.passed ? "passed" : "failed";
}

export function attemptResultLabel(session: MonitoredSession): string {
  const kind = attemptResultKind(session);

  if (kind === "passed") return "Зачёт";
  if (kind === "failed") return "Не зачтено";

  return sessionStatusLabels[session.status] ?? session.status;
}

export function attemptDeadline(session: MonitoredSession, assignment: TeacherAssignment | undefined): AttemptDeadline {
  if (session.status !== COMPLETED_SESSION_STATUS || session.completedAt === null) return "none";
  if (!assignment || assignment.dueAt === null) return "none";

  return Date.parse(session.completedAt) <= Date.parse(assignment.dueAt) ? "on_time" : "late";
}
