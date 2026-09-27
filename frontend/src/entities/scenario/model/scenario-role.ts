import type { ScenarioComposition } from "@/shared/api";

export type ScenarioRole = "OPERATOR_112" | "DDS" | "MIXED";

export function scenarioRole({ itemTypes, procedural }: ScenarioComposition): ScenarioRole | null {
  const operator = itemTypes.includes("INCOMING_CALL");
  const dispatcher = procedural || itemTypes.includes("INCIDENT_CARD");

  if (operator && dispatcher) return "MIXED";
  if (operator) return "OPERATOR_112";
  if (dispatcher) return "DDS";

  return null;
}
