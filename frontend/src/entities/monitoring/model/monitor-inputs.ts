import type { EmergencyService } from "@/shared/api";
import { CARD_OPEN_NORM_SECONDS, FIRST_ENTRY_NORM_SECONDS, IDLE_ALERT_MINUTES, TIMER_WARNING_RATIO } from "@/shared/config";
import type { MonitorNorms } from "./lesson-monitor";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

export const monitorNorms: MonitorNorms = {
  openMs: CARD_OPEN_NORM_SECONDS * SECOND_MS,
  firstEntryMs: FIRST_ENTRY_NORM_SECONDS * SECOND_MS,
  idleMs: IDLE_ALERT_MINUTES * MINUTE_MS,
  warningRatio: TIMER_WARNING_RATIO,
};

/** Позиция ДДС в назначении — код службы, а в журнале действий служба указана идентификатором. */
export function serviceIdOf(positionCode: string | null, services: Map<string, EmergencyService> | undefined): string | null {
  if (positionCode === null || services === undefined) return null;

  return [...services.entries()].find(([, service]) => service.code === positionCode)?.[0] ?? null;
}

export interface AttemptMetrics {
  fillMs: number | null;
  deviationMs: number | null;
  misspellings: number | null;
}
