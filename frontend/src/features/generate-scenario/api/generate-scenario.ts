import { api, type ScenarioGenerationDto, type ScenarioGenerationRequestDto } from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { generateScenarioMock } from "./generation.mocks";

const GENERATION_TIMEOUT_MS = 180_000;

export async function generateScenario(
  request: ScenarioGenerationRequestDto,
  signal: AbortSignal,
): Promise<ScenarioGenerationDto> {
  if (mocks.ai) return generateScenarioMock(request, signal);

  const { data } = await api.post<ScenarioGenerationDto>(`${CARD_API_URL}/scenario-drafts/generate`, request, {
    signal,
    timeout: GENERATION_TIMEOUT_MS,
  });

  return data;
}
