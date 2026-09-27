import type { ScenarioDraft } from "./scenario-draft.ts";

export interface DurationNorms {
  cardReactionSeconds: number;
  proceduralInitialDelaySeconds: number;
  proceduralIntervalSeconds: number;
}

const MIN_DURATION_SECONDS = 60;
const SECONDS_IN_MINUTE = 60;

function itemStarts(draft: ScenarioDraft): Map<string, number> {
  const byKey = new Map(draft.items.map((item) => [item.key, item]));
  const starts = new Map<string, number>();

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
          ? startOf(trigger.itemKey, new Set([...visiting, key])) + trigger.delaySeconds
          : 0;

    starts.set(key, start);
    return start;
  };

  draft.items.forEach((item) => startOf(item.key, new Set()));

  return starts;
}

function proceduralLastRelease(draft: ScenarioDraft, norms: DurationNorms): number | null {
  if (!draft.procedural.enabled) return null;

  return norms.proceduralInitialDelaySeconds + Math.max(draft.procedural.targetCount - 1, 0) * norms.proceduralIntervalSeconds;
}

export function estimateDurationSeconds(draft: ScenarioDraft, norms: DurationNorms): number {
  const starts = itemStarts(draft);
  const cardEnds = draft.items.map(
    (item) => (starts.get(item.key) ?? 0) + (item.itemType === "INCOMING_CALL" ? 0 : norms.cardReactionSeconds),
  );
  const procedural = proceduralLastRelease(draft, norms);
  const total = Math.max(
    MIN_DURATION_SECONDS,
    ...cardEnds,
    ...(procedural === null ? [] : [procedural + norms.cardReactionSeconds]),
  );

  return Math.ceil(total / SECONDS_IN_MINUTE) * SECONDS_IN_MINUTE;
}
