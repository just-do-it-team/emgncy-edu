import type { ParticipantPosition, ScenarioComposition, ScenarioWorkspaceMode } from "@/shared/api";

export type ScenarioRole = "OPERATOR_112" | "DDS" | "MIXED";

export interface ResolvedRole {
  role: ScenarioRole | null;
  derived: boolean;
}

export function scenarioRole({ itemTypes, procedural }: ScenarioComposition): ScenarioRole | null {
  const operator = itemTypes.includes("INCOMING_CALL");
  const dispatcher = procedural || itemTypes.includes("INCIDENT_CARD");

  if (operator && dispatcher) return "MIXED";
  if (operator) return "OPERATOR_112";
  if (dispatcher) return "DDS";

  return null;
}

export function roleFromPositions(positions: ParticipantPosition[]): ScenarioRole | null {
  const operator = positions.includes(null);
  const dispatcher = positions.some((position) => position !== null);

  if (operator && dispatcher) return "MIXED";
  if (operator) return "OPERATOR_112";
  if (dispatcher) return "DDS";

  return null;
}

export function resolvedScenarioRole(
  requiredPositions: ParticipantPosition[] | null,
  composition: ScenarioComposition,
): ResolvedRole {
  return requiredPositions === null || requiredPositions.length === 0
    ? { role: scenarioRole(composition), derived: true }
    : { role: roleFromPositions(requiredPositions), derived: false };
}

export interface PositionSuggestionInput {
  workspaceMode: ScenarioWorkspaceMode;
  hasCalls: boolean;
  mainServices: string[];
  minParticipants: number;
}

export function suggestedPositions({
  workspaceMode,
  hasCalls,
  mainServices,
  minParticipants,
}: PositionSuggestionInput): ParticipantPosition[] {
  const services = [...new Set(mainServices)];

  if (workspaceMode === "INDIVIDUAL") return [hasCalls ? null : (services[0] ?? null)];

  return [...(hasCalls ? [null] : []), ...services].slice(0, Math.max(minParticipants, 1));
}
