const offByDefault = (value: string | undefined) => value === "true";

export const mocks = {
  assignments: offByDefault(import.meta.env.VITE_MOCK_ASSIGNMENTS),
  callTranscript: offByDefault(import.meta.env.VITE_MOCK_CALL_TRANSCRIPT),
  cardTimeline: offByDefault(import.meta.env.VITE_MOCK_CARD_TIMELINE),
  expertReview: offByDefault(import.meta.env.VITE_MOCK_EXPERT_REVIEW),
  groups: offByDefault(import.meta.env.VITE_MOCK_GROUPS),
  monitoring: offByDefault(import.meta.env.VITE_MOCK_MONITORING),
  scenarios: offByDefault(import.meta.env.VITE_MOCK_SCENARIOS),
  services: offByDefault(import.meta.env.VITE_MOCK_SERVICES),
  students: offByDefault(import.meta.env.VITE_MOCK_STUDENTS),
} as const;
