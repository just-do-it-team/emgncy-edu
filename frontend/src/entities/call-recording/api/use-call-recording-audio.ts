import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCallRecordingContent } from "./call-recording-api";
import { callRecordingKeys } from "./call-recording.keys";

const CONTENT_GC_MS = 60 * 1000;

export function useCallRecordingAudio(callId: string, ready: boolean) {
  const content = useQuery({
    queryKey: callRecordingKeys.content(callId),
    queryFn: ({ signal }) => fetchCallRecordingContent(callId, signal),
    enabled: ready,
    staleTime: Infinity,
    gcTime: CONTENT_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!content.data) return;

    const url = URL.createObjectURL(content.data);
    setObjectUrl(url);

    return () => {
      URL.revokeObjectURL(url);
      setObjectUrl(null);
    };
  }, [content.data]);

  return { ...content, objectUrl };
}
