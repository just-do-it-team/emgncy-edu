import { useQuery } from "@tanstack/react-query";
import type { CallRecording } from "@/shared/api";
import { fetchCallRecording } from "./call-recording-api";
import { callRecordingKeys } from "./call-recording.keys";

const RECORDING_POLL_MS = 3000;
const SNAPSHOT_GC_MS = 30 * 60 * 1000;

function isPending(recording: CallRecording | undefined): boolean {
  return recording?.status === "QUEUED" || recording?.status === "PROCESSING";
}

export function useCallRecording(callId: string, enabled: boolean) {
  return useQuery({
    queryKey: callRecordingKeys.detail(callId),
    queryFn: ({ signal }) => fetchCallRecording(callId, signal),
    enabled,
    staleTime: ({ state }) => (isPending(state.data) ? 0 : Infinity),
    gcTime: SNAPSHOT_GC_MS,
    refetchInterval: ({ state }) => (isPending(state.data) ? RECORDING_POLL_MS : false),
    retry: false,
    meta: { showGlobalError: false },
  });
}
