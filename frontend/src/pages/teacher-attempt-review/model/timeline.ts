import type { Attempt, AttemptAction, AttemptError, ErrorSeverity } from "@/entities/attempt";

export interface TimelineMark {
  actionId: string;
  offsetSeconds: number;
  ratio: number;
}

export interface TimelineErrorMark extends TimelineMark {
  errorId: string;
  severity: ErrorSeverity;
}

export interface Timeline {
  totalSeconds: number;
  normRatio: number;
  normSeconds: number;
  ticks: TimelineMark[];
  errors: TimelineErrorMark[];
  rulerSeconds: number[];
}

const RULER_STEP_SECONDS = 30;

function offsetOf(attempt: Attempt, occurredAt: string): number {
  const started = new Date(attempt.started_at).getTime();

  return Math.round((new Date(occurredAt).getTime() - started) / 1000);
}

export function actionOffsetSeconds(attempt: Attempt, action: AttemptAction): number {
  return offsetOf(attempt, action.occurred_at);
}

export function buildTimeline(attempt: Attempt): Timeline {
  const normSeconds = attempt.timings.fill.norm_seconds;
  const actualSeconds = attempt.timings.fill.actual_seconds;
  const totalSeconds = Math.max(normSeconds, actualSeconds);

  const ticks = attempt.actions.map((action) => {
    const offsetSeconds = actionOffsetSeconds(attempt, action);

    return { actionId: action.action_id, offsetSeconds, ratio: offsetSeconds / totalSeconds };
  });

  const tickByAction = new Map(ticks.map((tick) => [tick.actionId, tick]));

  const errors = attempt.errors.reduce<TimelineErrorMark[]>((marks, error: AttemptError) => {
    const tick = error.action_id === null ? undefined : tickByAction.get(error.action_id);

    if (tick) marks.push({ ...tick, errorId: error.error_id, severity: error.severity });

    return marks;
  }, []);

  const rulerSeconds: number[] = [];
  for (let second = 0; second <= totalSeconds; second += RULER_STEP_SECONDS) {
    rulerSeconds.push(second);
  }

  return {
    totalSeconds,
    normSeconds,
    normRatio: normSeconds / totalSeconds,
    ticks,
    errors,
    rulerSeconds,
  };
}
