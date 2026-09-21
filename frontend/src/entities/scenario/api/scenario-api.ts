import { RequestError } from "@/shared/api";
import { USE_MOCKS } from "@/shared/config";
import type { Scenario, ScenarioListItem } from "../model/scenario";
import { scenarioListMocks, scenarioMocks } from "./scenario-mocks";

function notImplemented(endpoint: string): never {
  throw new RequestError(
    501,
    `${endpoint}: ручка на бэкенде не реализована, контракт — docs/api/scenarios.md. Для работы на моках задайте VITE_USE_MOCKS=true`,
  );
}

export async function fetchScenarios(): Promise<ScenarioListItem[]> {
  if (!USE_MOCKS) notImplemented("GET /api/v1/training-scenarios");

  return scenarioListMocks;
}

export async function fetchScenario(scenarioId: string): Promise<Scenario> {
  if (!USE_MOCKS) notImplemented("GET /api/v1/training-scenarios/{scenario_id}");

  const scenario = scenarioMocks.find((item) => item.scenario_id === scenarioId);

  if (!scenario) throw new RequestError(404, `Сценарий ${scenarioId} не найден`);

  return scenario;
}
