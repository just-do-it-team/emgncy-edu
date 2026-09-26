export const callRecordingKeys = {
  all: ["call-recordings"] as const,
  details: () => [...callRecordingKeys.all, "detail"] as const,
  detail: (callId: string) => [...callRecordingKeys.details(), callId] as const,
  contents: () => [...callRecordingKeys.all, "content"] as const,
  content: (callId: string) => [...callRecordingKeys.contents(), callId] as const,
};
