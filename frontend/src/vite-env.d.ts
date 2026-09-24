/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_AUTH_API_URL?: string;
  readonly VITE_ARM_API_URL?: string;
  readonly VITE_MOCK_CALL_TRANSCRIPT?: string;
  readonly VITE_MOCK_CARD_TIMELINE?: string;
  readonly VITE_MOCK_GROUPS?: string;
  readonly VITE_MOCK_LESSONS?: string;
  readonly VITE_MOCK_LESSON_RESULTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
