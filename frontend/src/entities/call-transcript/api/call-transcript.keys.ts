export const callTranscriptKeys = {
  all: ["call-transcripts"] as const,
  details: () => [...callTranscriptKeys.all, "detail"] as const,
  detail: (trainingSessionId: string) =>
    [...callTranscriptKeys.details(), trainingSessionId] as const,
};
