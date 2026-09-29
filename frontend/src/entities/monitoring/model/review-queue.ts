import type { MonitoredSession } from "@/shared/api";
import { COMPLETED_SESSION_STATUS } from "./labels.ts";

export type ReviewQueueState = "pending" | "confirmed" | "corrected";

const SCORE_EPSILON = 0.005;

export const reviewQueueLabels: Record<ReviewQueueState, string> = {
  pending: "На проверке",
  confirmed: "Подтверждены",
  corrected: "Исправлены",
};

/**
 * Место завершённой попытки в очереди проверки: преподаватель — конечный валидатор автоматической
 * оценки. Без оценки преподавателя попытка на проверке; оценка, совпавшая с автоматической по баллу
 * и зачёту, — подтверждение; любое отличие — исправление. Прерванные попытки сервер оценить не даёт,
 * поэтому в очередь они не попадают.
 */
export function reviewQueueState(session: MonitoredSession): ReviewQueueState | null {
  if (session.status !== COMPLETED_SESSION_STATUS) return null;
  if (!session.teacherAssessed) return "pending";

  const sameScore =
    session.score !== null &&
    session.automaticScore !== null &&
    Math.abs(session.score - session.automaticScore) <= SCORE_EPSILON;

  return sameScore && session.passed === session.automaticPassed ? "confirmed" : "corrected";
}

export function lessonKeyOf(session: MonitoredSession): string {
  return session.batchId ?? session.assignmentId;
}

/** Следующая попытка того же занятия без оценки преподавателя — в порядке завершения. */
export function nextPendingAttempt(sessions: MonitoredSession[], current: MonitoredSession): MonitoredSession | null {
  const lesson = lessonKeyOf(current);

  return (
    sessions
      .filter(
        (session) =>
          session.sessionId !== current.sessionId &&
          lessonKeyOf(session) === lesson &&
          reviewQueueState(session) === "pending",
      )
      .sort((first, second) => Date.parse(first.completedAt ?? "") - Date.parse(second.completedAt ?? ""))[0] ?? null
  );
}
