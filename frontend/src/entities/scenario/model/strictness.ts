import type { JsonObject, ScenarioSourceType } from "@/shared/api";
import { checkModeOf } from "./check-mode.ts";
import { expectedCardFields } from "./expected-fields.ts";

export interface ExpectedSource {
  source: ScenarioSourceType;
  card: JsonObject;
}

export interface Strictness {
  elements: number;
  checked: number;
  notChecked: number;
  mustBeEmpty: number;
  literal: number;
}

export function strictnessOf(expectations: ExpectedSource[]): Strictness {
  const modes = expectations.flatMap(({ source, card }) =>
    expectedCardFields.map((field) => ({ field, mode: checkModeOf(source, card, field.field) })),
  );

  return {
    elements: expectations.length,
    checked: modes.filter(({ mode }) => mode === "checked").length,
    notChecked: modes.filter(({ mode }) => mode === "not_checked").length,
    mustBeEmpty: modes.filter(({ mode }) => mode === "must_be_empty").length,
    literal: modes.filter(({ field, mode }) => mode === "checked" && field.literal).length,
  };
}
