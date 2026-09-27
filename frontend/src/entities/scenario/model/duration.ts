import type { ScenarioDraft } from "./scenario-draft.ts";

export interface DurationNorms {
  callSeconds: number;
  cardSeconds: number;
  proceduralInitialDelaySeconds: number;
  proceduralIntervalSeconds: number;
}

const MIN_DURATION_SECONDS = 60;
const SECONDS_IN_MINUTE = 60;

export function estimateDurationSeconds(draft: ScenarioDraft, norms: DurationNorms): number {
  const byKey = new Map(draft.items.map((item) => [item.key, item]));
  const starts = new Map<string, number>();

  const normOf = (key: string) =>
    byKey.get(key)?.itemType === "INCOMING_CALL" ? norms.callSeconds : norms.cardSeconds;

  const startOf = (key: string, visiting: Set<string>): number => {
    const known = starts.get(key);

    if (known !== undefined) return known;

    const item = byKey.get(key);

    if (!item || visiting.has(key)) return 0;

    const trigger = item.trigger;
    const start =
      trigger.kind === "offset"
        ? trigger.seconds
        : trigger.kind === "after"
          ? startOf(trigger.itemKey, new Set([...visiting, key])) + normOf(trigger.itemKey) + trigger.delaySeconds
          : 0;

    starts.set(key, start);
    return start;
  };

  const itemEnds = draft.items.map((item) => startOf(item.key, new Set()) + normOf(item.key));
  const procedural = draft.procedural.enabled
    ? [
        norms.proceduralInitialDelaySeconds +
          Math.max(draft.procedural.targetCount - 1, 0) * norms.proceduralIntervalSeconds +
          norms.cardSeconds,
      ]
    : [];
  const total = Math.max(MIN_DURATION_SECONDS, ...itemEnds, ...procedural);

  return Math.ceil(total / SECONDS_IN_MINUTE) * SECONDS_IN_MINUTE;
}
