import { assignmentWindow } from "./assignment-window.ts";

export type ScheduleTarget = { kind: "batch"; id: string } | { kind: "assignment"; id: string };

export interface ScheduleValue {
  availableFrom: string | null;
  dueAt: string | null;
}

export interface ScheduleBody {
  available_from: string;
  due_at: string;
}

const CHANGEABLE_STATUSES = new Set(["ASSIGNED", "EXPIRED"]);

/**
 * Какой ручкой переносить или отменять занятие. Занятие из партии меняется только через
 * `/assignment-batches/{id}`: одиночный запрос к назначению из партии сервер отклоняет с 409.
 * Занятие без партии — ровно одно назначение; если назначений несколько, а партии нет,
 * атомарно их не изменить, поэтому действие недоступно.
 */
export function scheduleTarget(batchId: string | null, assignmentIds: string[]): ScheduleTarget | null {
  if (batchId !== null) return { kind: "batch", id: batchId };

  const [only, ...rest] = assignmentIds;

  return only !== undefined && rest.length === 0 ? { kind: "assignment", id: only } : null;
}

export function scheduleTargetPath(target: ScheduleTarget): string {
  return target.kind === "batch" ? `/assignment-batches/${target.id}` : `/scenario-assignments/${target.id}`;
}

/**
 * Причина, по которой занятие уже нельзя перенести или отменить, — те же условия, что проверяет
 * сервер: ни одной попытки и все назначения ещё не начаты (или просрочены).
 */
export function scheduleChangeBlock(statuses: string[], attempts: number): string | null {
  if (attempts > 0) return "По занятию уже есть попытки: перенести или отменить его нельзя.";
  if (statuses.every((status) => status === "CANCELLED")) return "Занятие уже отменено.";
  if (statuses.some((status) => !CHANGEABLE_STATUSES.has(status))) {
    return "Занятие уже началось: перенести или отменить его нельзя.";
  }

  return null;
}

/**
 * Тело переноса. Пустые даты заменяются тем же окном по умолчанию, что применяет сервер при
 * назначении (сейчас и +7 дней), чтобы перенос без дат не сжимал окно до нуля.
 */
export function scheduleBody(value: ScheduleValue, now: number): ScheduleBody {
  const { start, due } = assignmentWindow(value.availableFrom, value.dueAt, now);

  return { available_from: new Date(start).toISOString(), due_at: new Date(due).toISOString() };
}
