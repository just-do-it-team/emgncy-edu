import type { AttemptMode, AttemptStudent, StageTiming } from "./attempt";

export interface AttemptErrorCounts {
  critical: number;
  significant: number;
  minor: number;
}

export interface AttemptSummaryScenario {
  scenario_id: string;
  revision: number;
  name: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface AttemptSummaryTimings {
  ack: StageTiming | null;
  fill: StageTiming;
}

export interface AttemptSummary {
  attempt_id: string;
  lesson_id: string;
  assignment_id: string;
  attempt_number: number;
  mode: AttemptMode;
  student: AttemptStudent;
  scenario: AttemptSummaryScenario;
  completed_at: string;
  timings: AttemptSummaryTimings;
  total: number;
  passed: boolean;
  is_reviewed: boolean;
  error_counts: AttemptErrorCounts;
}
