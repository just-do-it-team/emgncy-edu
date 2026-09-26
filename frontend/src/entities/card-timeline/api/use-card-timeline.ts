import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toActionTimeline, type TrainingActionDto } from "@/shared/api";
import { fetchTrainingActions } from "./card-timeline-api";
import { cardTimelineKeys } from "./card-timeline.keys";

const SNAPSHOT_GC_MS = 30 * 60 * 1000;

export function useCardTimeline(trainingSessionId: string, answeredAt: string | null) {
  const select = useCallback(
    (actions: TrainingActionDto[]) => toActionTimeline(actions, answeredAt),
    [answeredAt],
  );

  return useQuery({
    queryKey: cardTimelineKeys.detail(trainingSessionId),
    queryFn: ({ signal }) => fetchTrainingActions(trainingSessionId, signal),
    select,
    staleTime: Infinity,
    gcTime: SNAPSHOT_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}
