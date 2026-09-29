import type { JsonObject, JsonValue, ScenarioSourceType } from "@/shared/api";
import { checkModeOf } from "./check-mode.ts";
import { expectedCardFields } from "./expected-fields.ts";

export interface ExpectedSource {
  source: ScenarioSourceType;
  expected: JsonObject;
}

export interface Strictness {
  elements: number;
  strict: number;
  normalized: number;
  notScored: number;
  notChecked: number;
  mustBeEmpty: number;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function statusComments(expected: JsonObject): number {
  const history = expected.service_status_history;

  if (!isObject(history)) return 0;

  return Object.values(history).reduce<number>(
    (total, steps) =>
      total +
      (Array.isArray(steps)
        ? steps.filter((step) => isObject(step) && typeof step.comment === "string" && step.comment.trim() !== "").length
        : 0),
    0,
  );
}

/**
 * Сводка строгости эталонов сценария: сколько полей сравнивается строго, сколько с
 * нормализацией, сколько не оценивается, не проверяется или должно быть пустым.
 *
 * «Не оценивается» — это поля, которые сервер хранит, но исключает из балла (описание), плюс
 * комментарии к статусам ДДС: их тоже нет в балле, но преподавателю важно знать, сколько
 * текста уйдёт только на экспертную оценку.
 */
export function strictnessOf(expectations: ExpectedSource[]): Strictness {
  const cards = expectations.filter(({ expected }) => isObject(expected.card));
  const modes = cards.flatMap(({ source, expected }) => {
    const card = isObject(expected.card) ? expected.card : {};

    return expectedCardFields.map((field) => ({ field, mode: checkModeOf(source, card, field.field) }));
  });
  const evaluated = modes.filter(({ mode }) => mode !== "not_checked");
  const scored = evaluated.filter(({ field }) => field.comparison !== "not_scored");

  return {
    elements: cards.length,
    strict: scored.filter(({ field, mode }) => mode === "checked" && field.comparison === "strict").length,
    normalized: scored.filter(({ field, mode }) => mode === "checked" && field.comparison === "normalized").length,
    notScored:
      evaluated.filter(({ field }) => field.comparison === "not_scored").length +
      cards.reduce((total, { expected }) => total + statusComments(expected), 0),
    notChecked: modes.filter(({ mode }) => mode === "not_checked").length,
    mustBeEmpty: scored.filter(({ mode }) => mode === "must_be_empty").length,
  };
}
