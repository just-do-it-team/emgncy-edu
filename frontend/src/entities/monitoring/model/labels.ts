import type { ParticipantRole } from "@/shared/api";

export const participantRoleLabels: Record<ParticipantRole, string> = {
  OPERATOR_112: "Оператор 112",
  DDS: "Диспетчер ДДС",
};

export const COMPLETED_SESSION_STATUS = "COMPLETED";

export const sessionStatusLabels: Record<string, string> = {
  CREATED: "создана",
  RUNNING: "идёт",
  COMPLETED: "завершена",
  ABORTED: "прервана",
  TIMED_OUT: "истекло время",
};

export const ABORTED_SESSION_STATUS = "ABORTED";

export const abortedScoreHint = "Посчитан сервером по состоянию на момент прерывания";

export function isReviewable(status: string): boolean {
  return status === COMPLETED_SESSION_STATUS || status === ABORTED_SESSION_STATUS;
}

export function reviewAccessHint(status: string): string | null {
  if (status === COMPLETED_SESSION_STATUS) return null;
  if (status === ABORTED_SESSION_STATUS) {
    return "Ограниченный разбор: сервер не выставляет расхождения по прерванной попытке";
  }

  return "Разбор откроется после завершения";
}
