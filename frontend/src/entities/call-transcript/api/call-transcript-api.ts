import { api, toCallTranscript, type CallTranscript, type CallTranscriptDto } from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { callTranscriptMock } from "./call-transcript.mocks";

export async function fetchCallTranscript(
  trainingSessionId: string,
  signal?: AbortSignal,
): Promise<CallTranscript> {
  if (mocks.callTranscript) return toCallTranscript(callTranscriptMock);

  const { data } = await api.get<CallTranscriptDto>(
    `${CARD_API_URL}/training-sessions/${trainingSessionId}/call-transcript`,
    { signal },
  );

  return toCallTranscript(data);
}
