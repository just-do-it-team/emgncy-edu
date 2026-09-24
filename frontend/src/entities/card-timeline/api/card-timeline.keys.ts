export const cardTimelineKeys = {
  all: ["card-timelines"] as const,
  details: () => [...cardTimelineKeys.all, "detail"] as const,
  detail: (trainingSessionId: string) =>
    [...cardTimelineKeys.details(), trainingSessionId] as const,
};
