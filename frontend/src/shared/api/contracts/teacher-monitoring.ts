import { decimal } from "./decimal";
import type { ParticipantRole } from "./expert-review";

export interface TeacherMonitoringParticipantDto {
  user_id: string;
  display_name: string;
  status: string;
  position_code: string | null;
  participant_role: ParticipantRole;
}

export interface TeacherMonitoringSessionDto {
  session_id: string;
  assignment_id: string;
  assignment_batch_id: string | null;
  group_id: string | null;
  group_name: string | null;
  scenario_id: string;
  scenario_name: string;
  workspace_id: string;
  status: string;
  attempt_number: number;
  started_at: string;
  completed_at: string | null;
  score: string | null;
  passed: boolean | null;
  cards_total: number;
  cards_pending: number;
  cards_emitted: number;
  calls_total: number;
  calls_pending: number;
  calls_ringing: number;
  calls_active: number;
  calls_completed: number;
  pending_card_keys: string[];
  emitted_card_keys: string[];
  successful_actions: number;
  rejected_actions: number;
  last_activity_at: string | null;
  participants: TeacherMonitoringParticipantDto[];
}

export interface MonitoredParticipant {
  userId: string;
  displayName: string;
  role: ParticipantRole;
  positionCode: string | null;
}

export interface MonitoredSession {
  sessionId: string;
  assignmentId: string;
  batchId: string | null;
  groupName: string | null;
  scenarioName: string;
  workspaceId: string;
  status: string;
  attemptNumber: number;
  startedAt: string;
  completedAt: string | null;
  score: number | null;
  passed: boolean | null;
  lastActivityAt: string | null;
  participants: MonitoredParticipant[];
}

export function toMonitoredSession(dto: TeacherMonitoringSessionDto): MonitoredSession {
  return {
    sessionId: dto.session_id,
    assignmentId: dto.assignment_id,
    batchId: dto.assignment_batch_id,
    groupName: dto.group_name,
    scenarioName: dto.scenario_name,
    workspaceId: dto.workspace_id,
    status: dto.status,
    attemptNumber: dto.attempt_number,
    startedAt: dto.started_at,
    completedAt: dto.completed_at,
    score: decimal(dto.score),
    passed: dto.passed,
    lastActivityAt: dto.last_activity_at,
    participants: dto.participants.map((participant) => ({
      userId: participant.user_id,
      displayName: participant.display_name,
      role: participant.participant_role,
      positionCode: participant.position_code,
    })),
  };
}
