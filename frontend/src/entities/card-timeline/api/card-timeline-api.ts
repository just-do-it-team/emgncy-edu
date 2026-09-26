import { api, type TrainingActionDto } from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { trainingActionsMock } from "./card-timeline.mocks";

export async function fetchTrainingActions(
  trainingSessionId: string,
  signal?: AbortSignal,
): Promise<TrainingActionDto[]> {
  if (mocks.cardTimeline) return trainingActionsMock;

  const { data } = await api.get<TrainingActionDto[]>(
    `${CARD_API_URL}/training-sessions/${trainingSessionId}/actions`,
    { signal },
  );

  return data;
}
