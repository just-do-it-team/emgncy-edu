export const ASSIGNMENT_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AssignmentWindow {
  start: number;
  due: number;
}

export function assignmentWindow(availableFrom: string | null, dueAt: string | null, now: number): AssignmentWindow {
  const start = availableFrom === null ? now : Date.parse(availableFrom);
  const due = dueAt === null ? start + ASSIGNMENT_WINDOW_DAYS * DAY_MS : Date.parse(dueAt);

  return { start, due };
}

export function assignmentWindowProblem(availableFrom: string | null, dueAt: string | null, now: number): string | null {
  const { start, due } = assignmentWindow(availableFrom, dueAt, now);

  if (due <= start) {
    return availableFrom === null
      ? "Срок должен быть позже текущего момента: без даты начала занятие доступно сразу."
      : "Срок должен быть позже начала.";
  }
  if (due <= now) return "Срок уже прошёл: обучаемые не смогут начать занятие.";

  return null;
}
