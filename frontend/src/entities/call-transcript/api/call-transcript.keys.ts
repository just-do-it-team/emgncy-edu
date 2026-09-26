export const callTranscriptKeys = {
  all: ["call-transcripts"] as const,
  details: () => [...callTranscriptKeys.all, "detail"] as const,
  detail: (callId: string) => [...callTranscriptKeys.details(), callId] as const,
};
