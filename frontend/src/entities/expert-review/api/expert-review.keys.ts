export const expertReviewKeys = {
  all: ["expert-reviews"] as const,
  contexts: () => [...expertReviewKeys.all, "context"] as const,
  context: (trainingSessionId: string, teacherId: string) =>
    [...expertReviewKeys.contexts(), trainingSessionId, teacherId] as const,
  assignments: () => [...expertReviewKeys.all, "assignment"] as const,
  assignment: (assignmentId: string) => [...expertReviewKeys.assignments(), assignmentId] as const,
};
