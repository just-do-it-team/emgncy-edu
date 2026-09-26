export function decimal(value: string | null): number | null {
  if (value === null) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}
