import { decimal } from "./decimal";
import type { ParticipantRole, ScenarioAssignmentDto } from "./expert-review";

export type LaunchPolicy = "STUDENT_SELF_START" | "TEACHER_START" | "ALL_PARTICIPANTS_READY" | "SCHEDULED_START";

export type AssignmentParticipantStatus = "ASSIGNED" | "READY" | "RUNNING" | "COMPLETED";

export interface TeacherAssignmentParticipant {
  userId: string;
  role: ParticipantRole;
  status: AssignmentParticipantStatus;
  positionCode: string | null;
  readyAt: string | null;
  completedAt: string | null;
}

export interface TeacherAssignment {
  id: string;
  batchId: string | null;
  groupId: string | null;
  groupName: string | null;
  passingScore: number | null;
  scenarioId: string;
  scenarioName: string;
  scenarioRevision: number;
  workspaceMode: string;
  launchPolicy: LaunchPolicy;
  maxAttempts: number;
  status: string;
  availableFrom: string | null;
  dueAt: string | null;
  createdAt: string;
  participants: TeacherAssignmentParticipant[];
}

export function toTeacherAssignment(dto: ScenarioAssignmentDto): TeacherAssignment {
  return {
    id: dto.id,
    batchId: dto.assignment_batch_id,
    groupId: dto.group_id,
    groupName: dto.group_name,
    passingScore: decimal(dto.passing_score),
    scenarioId: dto.scenario_id,
    scenarioName: dto.scenario_name,
    scenarioRevision: dto.scenario_revision,
    workspaceMode: dto.workspace_mode,
    launchPolicy: dto.launch_policy,
    maxAttempts: dto.max_attempts,
    status: dto.status,
    availableFrom: dto.available_from,
    dueAt: dto.due_at,
    createdAt: dto.created_at,
    participants: dto.participants.map((participant) => ({
      userId: participant.user_id,
      role: participant.participant_role,
      status: participant.status,
      positionCode: participant.position_code,
      readyAt: participant.ready_at,
      completedAt: participant.completed_at,
    })),
  };
}

export interface AssignmentCreateDto {
  scenario_id: string;
  assigned_by: string;
  participant_ids: string[];
  participant_positions: Record<string, string | null>;
  incoming_call_operators: Record<string, string>;
  launch_policy: LaunchPolicy;
  max_attempts: number;
  available_from: string | null;
  due_at: string | null;
}

export interface AssignmentBatchDto {
  id: string;
  group_id: string;
  scenario_id: string;
  assigned_by: string;
  launch_policy: LaunchPolicy;
  max_attempts: number;
  available_from: string | null;
  due_at: string | null;
  created_at: string;
  participant_ids: string[];
  assignments: ScenarioAssignmentDto[];
}
