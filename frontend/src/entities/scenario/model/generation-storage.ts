const STORAGE_PREFIX = "template-generations:v1:";
const MAX_REMEMBERED = 10;

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function read(userId: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "[]");

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function write(userId: string, ids: string[]): void {
  try {
    if (ids.length === 0) window.localStorage.removeItem(storageKey(userId));
    else window.localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  } catch {
    return;
  }
}

/**
 * Незавершённые генерации шаблонов преподавателя. Сервер не отдаёт список генераций, поэтому
 * идентификаторы запущенных задач хранятся в браузере, чтобы после возврата на страницу показать
 * их состояние. Хранятся только идентификаторы задач, без содержимого шаблонов.
 */
export function rememberedGenerations(userId: string): string[] {
  return read(userId);
}

export function rememberGeneration(userId: string, generationId: string): void {
  write(userId, [...read(userId).filter((id) => id !== generationId), generationId].slice(-MAX_REMEMBERED));
}

export function forgetGeneration(userId: string, generationId: string): void {
  write(userId, read(userId).filter((id) => id !== generationId));
}
