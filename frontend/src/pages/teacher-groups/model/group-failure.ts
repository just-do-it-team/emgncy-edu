import { errorDetail, errorStatus } from "@/shared/api";

const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;

export const DUPLICATE_NAME = "Группа с таким названием уже есть.";

export function isDuplicateName(error: unknown): boolean {
  const detail = errorDetail(error);

  return errorStatus(error) === CONFLICT && typeof detail === "string" && /already exists/i.test(detail);
}

export function groupFailureText(error: unknown): string {
  const status = errorStatus(error);
  const detail = errorDetail(error);

  if (isDuplicateName(error)) return DUPLICATE_NAME;
  if (typeof detail === "string" && /archived/i.test(detail)) return "Группа в архиве: состав не меняется.";
  if (status === FORBIDDEN) return "Группа принадлежит другому преподавателю.";
  if (status === NOT_FOUND) return "Группа или обучаемый не найдены. Обновите страницу.";

  return "Сервер не ответил. Повторите попытку позже.";
}
