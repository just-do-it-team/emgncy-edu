import type { Attempt, AttemptError, ErrorSeverity } from "@/entities/attempt";
import type { DiffRow } from "./card-diff";

export type ReviewView = "comparison" | "submitted" | "reference";

export interface FieldState {
  row: DiffRow;
  severity: ErrorSeverity | null;
  errorId: string | null;
}

export function fieldState(
  field: string,
  rows: Map<string, DiffRow>,
  errorsByField: Map<string, AttemptError[]>,
): FieldState | null {
  const row = rows.get(field);

  if (!row) return null;

  const scope = field.split(".").slice(0, 2).join(".");
  const errors = errorsByField.get(scope) ?? [];
  const leading = errors[0] ?? null;

  return { row, severity: leading?.severity ?? null, errorId: leading?.error_id ?? null };
}

export function timerSeconds(attempt: Attempt): number {
  return attempt.timings.fill.actual_seconds;
}

export function formatClock(totalSeconds: number): { minutes: string; seconds: string } {
  return {
    minutes: String(Math.floor(totalSeconds / 60)).padStart(2, "0"),
    seconds: String(totalSeconds % 60).padStart(2, "0"),
  };
}
