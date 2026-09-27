import type { JsonObject, ScenarioSourceType } from "@/shared/api";

export type CheckMode = "checked" | "not_checked" | "must_be_empty";

export function checkModeOf(source: ScenarioSourceType, expected: JsonObject, field: string): CheckMode {
  if (!(field in expected)) return "not_checked";
  if (expected[field] !== null) return "checked";

  return source === "INLINE" ? "not_checked" : "must_be_empty";
}
