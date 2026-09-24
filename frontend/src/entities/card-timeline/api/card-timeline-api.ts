import { api, toCardTimeline, type CardTimeline, type CardTimelineDto } from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { cardTimelineMock } from "./card-timeline.mocks";

export async function fetchCardTimeline(
  trainingSessionId: string,
  signal?: AbortSignal,
): Promise<CardTimeline> {
  if (mocks.cardTimeline) return toCardTimeline(cardTimelineMock);

  const { data } = await api.get<CardTimelineDto>(
    `${CARD_API_URL}/training-sessions/${trainingSessionId}/timeline`,
    { signal },
  );

  return toCardTimeline(data);
}
