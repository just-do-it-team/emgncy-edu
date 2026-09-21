import type { AttemptAction } from "./attempt-action";
import type { AttemptError } from "./attempt-error";
import type { Arm112Card, DdsCard } from "./incident-card";
import type { IncidentTypeRef, QuestionnaireGroup } from "./references";
import type { ScoreBreakdown } from "./score";

export type AttemptMode = "ARM112" | "DDS";

export interface AttemptStudent {
  student_id: string;
  full_name: string;
  workstation_number: number;
}

export interface AttemptScenario {
  scenario_id: string;
  revision: number;
  name: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  reference_incident_type: IncidentTypeRef;
}

export interface StageTiming {
  actual_seconds: number;
  norm_seconds: number;
}

export interface Arm112Timings {
  fill: StageTiming;
}

export interface DdsTimings {
  ack: StageTiming;
  fill: StageTiming;
}

export interface ExpertReview {
  reviewed_by: string;
  reviewed_by_name: string;
  reviewed_at: string;
  previous_total: number;
  total: number;
  comment: string;
}

interface AttemptBase {
  attempt_id: string;
  lesson_id: string;
  assignment_id: string;
  attempt_number: number;
  incident_card_number: string;
  student: AttemptStudent;
  scenario: AttemptScenario;
  questionnaire: QuestionnaireGroup[];
  started_at: string;
  completed_at: string;
  score: ScoreBreakdown;
  errors: AttemptError[];
  actions: AttemptAction[];
  expert_review: ExpertReview | null;
}

export interface Arm112Attempt extends AttemptBase {
  mode: "ARM112";
  timings: Arm112Timings;
  submitted_card: Arm112Card;
  reference_card: Arm112Card;
}

export interface DdsAttempt extends AttemptBase {
  mode: "DDS";
  timings: DdsTimings;
  submitted_card: DdsCard;
  reference_card: DdsCard;
}

export type Attempt = Arm112Attempt | DdsAttempt;
