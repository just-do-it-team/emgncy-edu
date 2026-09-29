import { CARD_OPEN_NORM_SECONDS, FIRST_ENTRY_NORM_SECONDS, PROCEDURAL_PACE_BY_DIFFICULTY } from "@/shared/config";
import { estimateDurationSeconds } from "./duration";
import type { ScenarioDraft } from "./scenario-draft";

export function scenarioDurationSeconds(draft: ScenarioDraft): number {
  const pace = PROCEDURAL_PACE_BY_DIFFICULTY.get(draft.difficulty);

  return estimateDurationSeconds(draft, {
    cardReactionSeconds: CARD_OPEN_NORM_SECONDS + FIRST_ENTRY_NORM_SECONDS,
    proceduralInitialDelaySeconds: pace?.initialDelaySeconds ?? 0,
    proceduralIntervalSeconds: pace?.releaseIntervalSeconds ?? 0,
  });
}
