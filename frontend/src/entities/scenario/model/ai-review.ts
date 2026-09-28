export interface AiReview {
  model: string;
  generatedAt: string;
  suggestedDifficulty: number | null;
  itemKeys: string[];
  checkedKeys: string[];
}

export interface AiReviewProgress {
  checked: number;
  total: number;
  pendingKeys: string[];
}

export function aiReviewProgress(review: AiReview, presentKeys: string[]): AiReviewProgress {
  const present = new Set(presentKeys);
  const required = review.itemKeys.filter((key) => present.has(key));
  const checked = new Set(review.checkedKeys);

  return {
    checked: required.filter((key) => checked.has(key)).length,
    total: required.length,
    pendingKeys: required.filter((key) => !checked.has(key)),
  };
}

export function aiApprovalBlock(
  review: AiReview | null,
  presentKeys: string[],
  labelOf: (key: string) => string,
): string | null {
  if (review === null) return null;

  const progress = aiReviewProgress(review, presentKeys);

  if (progress.pendingKeys.length === 0) return null;

  return `Сценарий сгенерирован ИИ. Утвердить можно после проверки эталона у всех элементов: проверено ${progress.checked} из ${progress.total}, осталось — ${progress.pendingKeys.map(labelOf).join(", ")}.`;
}

export function withItemChecked(review: AiReview, key: string, checked: boolean): AiReview {
  const rest = review.checkedKeys.filter((candidate) => candidate !== key);

  return { ...review, checkedKeys: checked ? [...rest, key] : rest };
}
