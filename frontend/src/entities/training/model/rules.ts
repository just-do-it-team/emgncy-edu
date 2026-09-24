import type { Assignment } from "./types";
export const statusLabels: Record<string, string> = {
  ASSIGNED: "Назначено",
  RUNNING: "В процессе",
  COMPLETED: "Завершено",
  ABORTED: "Не сдано",
  CANCELLED: "Отменено",
  EXPIRED: "Истёк срок",
  REGISTERED: "Зарегистрирована",
  PROCESSED: "Обработана",
  CHECKED: "Проверена",
  REFUSAL: "Отказ",
  NOT_COMPLETED: "Не завершена",
  ADDED: "Добавлена",
  NOT_NOTIFIED: "Не оповещена",
  RECEIVED: "Получена службой",
  ACCEPTED: "Принята",
  REJECTED: "Не принята",
  RESPONSE_STARTED: "Начало реагирования",
  ARRIVED: "Прибытие",
  WORK_IN_PROGRESS: "Проведение работ",
  WORK_COMPLETED: "Работы завершены",
  WORK_REFUSED: "Отказ от выполнения работ",
  QUEUED: "В очереди",
  PROCESSING: "Обработка",
  FAILED: "Ошибка",
};
const transitions: Record<string, string[]> = {
  ADDED: ["RECEIVED", "ACCEPTED", "REJECTED"],
  NOT_NOTIFIED: ["RECEIVED", "ACCEPTED", "REJECTED"],
  RECEIVED: ["ACCEPTED", "REJECTED"],
  REJECTED: ["ACCEPTED"],
  ACCEPTED: ["RESPONSE_STARTED", "WORK_REFUSED"],
  RESPONSE_STARTED: ["ARRIVED", "WORK_REFUSED"],
  ARRIVED: ["WORK_IN_PROGRESS", "WORK_REFUSED"],
  WORK_IN_PROGRESS: ["WORK_COMPLETED", "WORK_REFUSED"],
};
export function allowedServiceStatuses(status: string, code: string) {
  return (transitions[status] ?? []).filter(
    (next) => code !== "103" || !["REJECTED", "WORK_REFUSED"].includes(next),
  );
}
export function assignmentBlocker(
  assignment: Assignment,
  attempts: number,
  now = Date.now(),
) {
  if (!["ASSIGNED"].includes(assignment.status))
    return statusLabels[assignment.status] ?? assignment.status;
  if (assignment.launch_policy !== "STUDENT_SELF_START")
    return "Запускает преподаватель";
  if (assignment.available_from && Date.parse(assignment.available_from) > now)
    return "Ещё не доступно";
  if (assignment.due_at && Date.parse(assignment.due_at) < now)
    return "Истёк срок";
  if (attempts >= assignment.max_attempts) return "Попытки исчерпаны";
  return null;
}
export function formatApiDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ru-RU") : "—";
}
