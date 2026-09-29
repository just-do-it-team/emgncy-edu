import type { JsonObject, ScenarioSourceType } from "@/shared/api";

export type CheckMode = "checked" | "not_checked" | "must_be_empty";

/**
 * Режим проверки поля эталона так, как его понимает сервер.
 *
 * Поле отсутствует — не проверяется. Поле со значением — проверяется. Значение `null`
 * трактуется по-разному в зависимости от источника: у встроенной карточки сценария `null`
 * значит «не проверяется», у шаблона — «должно остаться пустым». Семантику задаёт бэкенд,
 * фронт её только отражает, иначе редактор и оценка разойдутся.
 */
export function checkModeOf(source: ScenarioSourceType, expected: JsonObject, field: string): CheckMode {
  if (!(field in expected)) return "not_checked";
  if (expected[field] !== null) return "checked";

  return source === "INLINE" ? "not_checked" : "must_be_empty";
}
