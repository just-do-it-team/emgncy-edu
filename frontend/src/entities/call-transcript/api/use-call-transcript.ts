import { useQuery } from "@tanstack/react-query";
import { fetchCallTranscript } from "./call-transcript-api";
import { callTranscriptKeys } from "./call-transcript.keys";

const SNAPSHOT_GC_MS = 30 * 60 * 1000;

export function useCallTranscript(trainingSessionId: string) {
  return useQuery({
    queryKey: callTranscriptKeys.detail(trainingSessionId),
    queryFn: ({ signal }) => fetchCallTranscript(trainingSessionId, signal),
    staleTime: Infinity,
    gcTime: SNAPSHOT_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}
