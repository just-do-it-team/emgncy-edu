import { api, toCallRecording, type CallRecording, type CallRecordingDto } from "@/shared/api";
import { CARD_API_URL } from "@/shared/config";

export async function fetchCallRecording(
  callId: string,
  signal?: AbortSignal,
): Promise<CallRecording> {
  const { data } = await api.get<CallRecordingDto>(
    `${CARD_API_URL}/training-calls/${callId}/recording`,
    { signal },
  );

  return toCallRecording(data);
}

export async function fetchCallRecordingContent(
  callId: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const { data } = await api.get<Blob>(
    `${CARD_API_URL}/training-calls/${callId}/recording/content`,
    { signal, responseType: "blob" },
  );

  return data;
}
