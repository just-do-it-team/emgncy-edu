import { useQuery } from "@tanstack/react-query";
import { fetchCardTimeline } from "./card-timeline-api";
import { cardTimelineKeys } from "./card-timeline.keys";

const SNAPSHOT_GC_MS = 30 * 60 * 1000;

export function useCardTimeline(trainingSessionId: string) {
  return useQuery({
    queryKey: cardTimelineKeys.detail(trainingSessionId),
    queryFn: ({ signal }) => fetchCardTimeline(trainingSessionId, signal),
    staleTime: Infinity,
    gcTime: SNAPSHOT_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}
