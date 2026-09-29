import type { CriterionCode } from "@/shared/config";

export interface CriterionCount {
  code: CriterionCode;
  attempts: number;
}

export const TREND_WINDOW = 3;
export const TOP_ERRORS = 3;

/**
 * Рекомендации по группам проверок — шаблонный текст без модели: что именно перепроверить в
 * следующей попытке. Формулировки опираются на то, что сервер сравнивает в каждой группе.
 */
export const criterionAdvice: Record<CriterionCode, string> = {
  C1: "Перед выбором типа происшествия дослушайте заявителя и проверьте каждый определяющий признак: от них зависит список служб.",
  C2: "Сверяйте список служб с типом происшествия и признаками; главную службу нельзя пропускать.",
  C3: "Заполняйте все поля карточки, которые сообщил заявитель: телефоны, число пострадавших, данные заявителя.",
  C4: "Уточняйте адрес целиком — улицу, дом, корпус — и повторяйте его заявителю для подтверждения.",
  C5: "Открывайте карточку в течение 30 секунд и делайте первую запись со статусом и текстом в течение 3 минут.",
  C6: "Перечитывайте описание перед сохранением.",
  C7: "Ведите статусы реагирования по порядку и сопровождайте каждый комментарием.",
};

export function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Динамика: средний балл последних трёх попыток минус средний балл всех предыдущих. */
export function scoreTrend(scoresOldestFirst: number[]): number | null {
  if (scoresOldestFirst.length <= TREND_WINDOW) return null;

  const recent = mean(scoresOldestFirst.slice(-TREND_WINDOW));
  const before = mean(scoresOldestFirst.slice(0, -TREND_WINDOW));

  return recent === null || before === null ? null : recent - before;
}

export function topCriteria(perAttempt: CriterionCode[][]): CriterionCount[] {
  const counts = new Map<CriterionCode, number>();

  for (const codes of perAttempt) for (const code of new Set(codes)) counts.set(code, (counts.get(code) ?? 0) + 1);

  return [...counts]
    .map(([code, attempts]) => ({ code, attempts }))
    .sort((first, second) => second.attempts - first.attempts || first.code.localeCompare(second.code))
    .slice(0, TOP_ERRORS);
}
