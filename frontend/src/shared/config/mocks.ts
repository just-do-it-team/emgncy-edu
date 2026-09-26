const onByDefault = (value: string | undefined) => value !== "false";

const offByDefault = (value: string | undefined) => value === "true";

export const mocks = {
  callTranscript: offByDefault(import.meta.env.VITE_MOCK_CALL_TRANSCRIPT),
  cardTimeline: offByDefault(import.meta.env.VITE_MOCK_CARD_TIMELINE),
  expertReview: offByDefault(import.meta.env.VITE_MOCK_EXPERT_REVIEW),
  groups: offByDefault(import.meta.env.VITE_MOCK_GROUPS),
  lessons: onByDefault(import.meta.env.VITE_MOCK_LESSONS),
  lessonResults: onByDefault(import.meta.env.VITE_MOCK_LESSON_RESULTS),
  services: offByDefault(import.meta.env.VITE_MOCK_SERVICES),
  students: offByDefault(import.meta.env.VITE_MOCK_STUDENTS),
} as const;
