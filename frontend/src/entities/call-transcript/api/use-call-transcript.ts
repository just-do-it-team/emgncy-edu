import { useQuery } from "@tanstack/react-query";
import { fetchCallTranscript } from "./call-transcript-api";
import { callTranscriptKeys } from "./call-transcript.keys";

const SNAPSHOT_GC_MS = 30 * 60 * 1000;

export function useCallTranscript(callId: string) {
  return useQuery({
    queryKey: callTranscriptKeys.detail(callId),
    queryFn: ({ signal }) => fetchCallTranscript(callId, signal),
    staleTime: Infinity,
    gcTime: SNAPSHOT_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}
