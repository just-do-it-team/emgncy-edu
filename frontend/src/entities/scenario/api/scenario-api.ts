import {
  api,
  RequestError,
  toScenarioDetail,
  toScenarioListItem,
  type ScenarioDetail,
  type ScenarioListItem,
  type TrainingScenarioDetailDto,
  type TrainingScenarioDto,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { scenarioDetailMocks } from "./scenario.mocks";

export async function fetchScenarios(signal?: AbortSignal): Promise<ScenarioListItem[]> {
  if (mocks.scenarios) return scenarioDetailMocks.map(toScenarioListItem);

  const { data } = await api.get<TrainingScenarioDto[]>(`${CARD_API_URL}/training-scenarios`, {
    signal,
  });

  return data.map(toScenarioListItem);
}

export async function fetchScenario(scenarioId: string, signal?: AbortSignal): Promise<ScenarioDetail> {
  if (mocks.scenarios) {
    const found = scenarioDetailMocks.find((item) => item.id === scenarioId);

    if (!found) throw new RequestError(404, "Сценарий не найден");

    return toScenarioDetail(found);
  }

  const { data } = await api.get<TrainingScenarioDetailDto>(
    `${CARD_API_URL}/training-scenarios/${scenarioId}`,
    { signal },
  );

  return toScenarioDetail(data);
}
