import type { AiReview } from "./ai-review";

const STORAGE_PREFIX = "scenario-ai-review:v1:";

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isAiReview(value: unknown): value is AiReview {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.model === "string" &&
    typeof candidate.generatedAt === "string" &&
    (candidate.suggestedDifficulty === null || typeof candidate.suggestedDifficulty === "number") &&
    isStringList(candidate.itemKeys) &&
    isStringList(candidate.checkedKeys)
  );
}

export function loadAiReview(scenarioId: string): AiReview | null {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${scenarioId}`);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);

    return isAiReview(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveAiReview(scenarioId: string, review: AiReview): void {
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${scenarioId}`, JSON.stringify(review));
  } catch {
    return;
  }
}
