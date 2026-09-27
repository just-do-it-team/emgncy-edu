const difficultyNames = ["Простой", "Средний", "Сложный", "Сверхсложный"] as const;

export const difficultyOptions = difficultyNames.map((label, index) => ({ value: String(index + 1), label }));

export function difficultyLevel(difficulty: number): number {
  return Math.min(Math.max(difficulty, 1), difficultyNames.length);
}

export function difficultyLabel(difficulty: number): string {
  return difficultyNames[difficultyLevel(difficulty) - 1] ?? difficultyNames[0];
}
