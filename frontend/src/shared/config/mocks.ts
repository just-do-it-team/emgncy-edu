const enabled = (value: string | undefined) => value === "true";

const demo = enabled(import.meta.env.VITE_DEMO);

const mockedInDemo = (value: string | undefined) => demo || enabled(value);

export const mocks = {
  ai: mockedInDemo(import.meta.env.VITE_MOCK_AI),
  legacyAiScenario: enabled(import.meta.env.VITE_MOCK_AI),
  assignments: mockedInDemo(import.meta.env.VITE_MOCK_ASSIGNMENTS),
  callTranscript: mockedInDemo(import.meta.env.VITE_MOCK_CALL_TRANSCRIPT),
  cardTimeline: mockedInDemo(import.meta.env.VITE_MOCK_CARD_TIMELINE),
  expertReview: mockedInDemo(import.meta.env.VITE_MOCK_EXPERT_REVIEW),
  groups: mockedInDemo(import.meta.env.VITE_MOCK_GROUPS),
  monitoring: mockedInDemo(import.meta.env.VITE_MOCK_MONITORING),
  scenarios: mockedInDemo(import.meta.env.VITE_MOCK_SCENARIOS),
  services: mockedInDemo(import.meta.env.VITE_MOCK_SERVICES),
  students: mockedInDemo(import.meta.env.VITE_MOCK_STUDENTS),
} as const;
