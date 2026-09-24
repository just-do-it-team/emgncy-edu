const onByDefault = (value: string | undefined) => value !== "false";

const offByDefault = (value: string | undefined) => value === "true";

export const mocks = {
  callTranscript: onByDefault(import.meta.env.VITE_MOCK_CALL_TRANSCRIPT),
  cardTimeline: onByDefault(import.meta.env.VITE_MOCK_CARD_TIMELINE),
  groups: offByDefault(import.meta.env.VITE_MOCK_GROUPS),
  lessons: onByDefault(import.meta.env.VITE_MOCK_LESSONS),
  lessonResults: onByDefault(import.meta.env.VITE_MOCK_LESSON_RESULTS),
} as const;
