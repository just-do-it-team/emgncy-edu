const SECOND_MS = 1000;
const MINUTE_S = 60;

function clock(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / MINUTE_S)}:${String(totalSeconds % MINUTE_S).padStart(2, "0")}`;
}

export function formatFillTime(ms: number | null): string {
  return ms === null ? "—" : clock(Math.max(0, Math.round(ms / SECOND_MS)));
}

/** Отклонение от норматива со знаком: «+0:42» — дольше норматива, «−1:10» — быстрее. */
export function formatDeviation(ms: number | null): string {
  if (ms === null) return "—";

  const seconds = Math.round(ms / SECOND_MS);

  return seconds === 0 ? "0:00" : `${seconds > 0 ? "+" : "−"}${clock(Math.abs(seconds))}`;
}
