const SECOND_MS = 1000;
const MINUTE_S = 60;
const HOUR_S = 60 * MINUTE_S;

const pad = (value: number) => String(value).padStart(2, "0");

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND_MS));
  const hours = Math.floor(total / HOUR_S);
  const minutes = Math.floor((total % HOUR_S) / MINUTE_S);
  const seconds = total % MINUTE_S;

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export function formatAgo(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / SECOND_MS));

  if (seconds < MINUTE_S) return `${seconds} с назад`;
  if (seconds < HOUR_S) return `${Math.floor(seconds / MINUTE_S)} мин назад`;

  return `${Math.floor(seconds / HOUR_S)} ч назад`;
}
