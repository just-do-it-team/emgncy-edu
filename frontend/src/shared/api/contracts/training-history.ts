import { decimal } from "./decimal";
import type { JsonObject } from "./json";

export interface StudentTrainingHistoryItemDto {
  session_id: string;
  assignment_id: string;
  assignment_batch_id: string | null;
  group_id: string | null;
  group_name: string | null;
  scenario_id: string;
  scenario_name: string;
  attempt_number: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  automatic_score: string | null;
  automatic_passed: boolean | null;
  automatic_result: JsonObject;
  expert_score: string | null;
  expert_passed: boolean | null;
  final_score: string | null;
  final_passed: boolean | null;
  expert_comment: string | null;
  expert_evaluated_by: string | null;
  expert_evaluated_at: string | null;
}

export interface TrainingHistoryItem {
  sessionId: string;
  scenarioName: string;
  groupName: string | null;
  attemptNumber: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  score: number | null;
  passed: boolean | null;
  scoredByTeacher: boolean;
}

export function toTrainingHistoryItem(dto: StudentTrainingHistoryItemDto): TrainingHistoryItem {
  return {
    sessionId: dto.session_id,
    scenarioName: dto.scenario_name,
    groupName: dto.group_name,
    attemptNumber: dto.attempt_number,
    status: dto.status,
    startedAt: dto.started_at,
    completedAt: dto.completed_at,
    score: decimal(dto.final_score),
    passed: dto.final_passed,
    scoredByTeacher: dto.expert_score !== null,
  };
}
