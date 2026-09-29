import { decimal } from "./decimal";
import type { JsonObject, JsonValue } from "./json";
import type { AssignmentParticipantStatus, LaunchPolicy } from "./assignments";
import type { CallSpeaker } from "./call-transcript";
import { toActionTimeline, type ActionEvent, type TrainingActionDto } from "./training-actions";

export type ParticipantRole = "OPERATOR_112" | "DDS";

export interface DiscrepancyDto {
  path: string;
  expected: JsonValue;
  actual: JsonValue;
  reason: string;
}

export interface CardOutcomeDto {
  scenario_card_key: string;
  incident_card_id: string;
  score: string;
  passed: boolean;
  discrepancies: DiscrepancyDto[];
}

export interface CallOutcomeDto {
  scenario_item_key: string;
  training_call_id: string;
  incident_card_id: string;
  score: string;
  passed: boolean;
  discrepancies: DiscrepancyDto[];
}

export interface TrainingSessionDto {
  id: string;
  assignment_id: string;
  attempt_number: number;
  status: string;
  completion_policy: string;
  completion_state: JsonObject;
  completion_state_revision: number;
  ready_to_complete_at: string | null;
  completed_automatically: boolean;
  started_at: string;
  completed_at: string | null;
  score: string | null;
  passed: boolean | null;
  result: {
    cards: CardOutcomeDto[];
    incoming_calls: CallOutcomeDto[];
    passing_score?: string | null;
    abort_reason?: string | null;
  };
  expert_score: string | null;
  expert_passed: boolean | null;
  expert_comment: string | null;
  expert_evaluated_by: string | null;
  expert_evaluated_at: string | null;
}

export interface CardAutomaticResultDto {
  score: number;
  passed: boolean;
  discrepancies: DiscrepancyDto[];
  evaluated_at: string;
}

export interface CallAutomaticResultDto {
  scenario_item_key: string;
  training_call_id: string;
  incident_card_id: string;
  score: number;
  passed: boolean;
  discrepancies: DiscrepancyDto[];
}

export interface ExpertReviewCardDto {
  scenario_card_key: string;
  incident_card_id: string | null;
  expected_result: JsonObject;
  current_state: JsonObject | null;
  automatic_result: CardAutomaticResultDto | null;
}

export interface ExpertReviewCallDto {
  scenario_item_key: string;
  training_call_id: string;
  incident_card_id: string | null;
  status: string;
  ringing_at: string | null;
  answered_at: string | null;
  completed_at: string | null;
  expected_result: JsonObject;
  current_state: JsonObject | null;
  automatic_result: CallAutomaticResultDto | null;
}

export interface ExpertReviewUtteranceDto {
  id: string;
  call_id: string;
  speaker: CallSpeaker;
  input_mode: "VOICE" | "GENERATED";
  sequence_no: number;
  created_at: string;
  text: string;
}

export interface ExpertReviewContextDto {
  session: TrainingSessionDto;
  scenario_snapshot: JsonObject;
  participant_ids: string[];
  cards: ExpertReviewCardDto[];
  incoming_calls: ExpertReviewCallDto[];
  outgoing_calls: ExpertReviewOutgoingCallDto[];
  call_utterances: ExpertReviewUtteranceDto[];
  actions: TrainingActionDto[];
}

export interface ExpertReviewOutgoingCallDto {
  id: string;
  card_id: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  interlocutor_role: string;
}

export interface ExpertAssessmentRequestDto {
  teacher_id: string;
  score: string;
  passed: boolean;
  comment: string | null;
}

export interface AssignmentParticipantDto {
  user_id: string;
  status: AssignmentParticipantStatus;
  position_code: string | null;
  participant_role: ParticipantRole;
  ready_at: string | null;
  completed_at: string | null;
}

export interface ScenarioAssignmentDto {
  id: string;
  scenario_id: string;
  scenario_name: string;
  scenario_revision: number;
  passing_score: string;
  assignment_batch_id: string | null;
  group_id: string | null;
  group_name: string | null;
  assigned_by: string;
  workspace_mode: string;
  launch_policy: LaunchPolicy;
  max_attempts: number;
  status: string;
  available_from: string | null;
  due_at: string | null;
  created_at: string;
  participants: AssignmentParticipantDto[];
}

export interface Discrepancy {
  path: string;
  expected: JsonValue;
  actual: JsonValue;
  reason: string;
}

export interface AutomaticResult {
  score: number;
  passed: boolean;
  discrepancies: Discrepancy[];
  evaluatedAt: string | null;
}

export interface ExpertAssessment {
  score: number;
  passed: boolean;
  comment: string | null;
  evaluatedBy: string | null;
  evaluatedAt: string | null;
}

export interface ReviewSession {
  id: string;
  assignmentId: string;
  attemptNumber: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  score: number | null;
  passed: boolean | null;
  passingScore: number | null;
  abortReason: string | null;
  expertAssessment: ExpertAssessment | null;
}

export interface ReviewCard {
  scenarioCardKey: string;
  incidentCardId: string | null;
  expectedResult: JsonObject;
  currentState: JsonObject | null;
  automaticResult: AutomaticResult | null;
}

export interface ReviewCall {
  scenarioItemKey: string;
  trainingCallId: string;
  incidentCardId: string | null;
  status: string;
  ringingAt: string | null;
  answeredAt: string | null;
  completedAt: string | null;
  expectedResult: JsonObject;
  currentState: JsonObject | null;
  automaticResult: AutomaticResult | null;
}

export interface ExpertReviewContext {
  session: ReviewSession;
  scenarioSnapshot: JsonObject;
  participantIds: string[];
  cards: ReviewCard[];
  incomingCalls: ReviewCall[];
  outgoingCalls: ReviewOutgoingCall[];
  actions: ActionEvent[];
}

export interface ReviewOutgoingCall {
  trainingCallId: string;
  incidentCardId: string | null;
  operatorUserId: string | null;
  status: string;
  interlocutorRole: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AssignmentParticipant {
  userId: string;
  role: ParticipantRole;
  positionCode: string | null;
  status: string;
}

export interface ReviewAssignment {
  id: string;
  scenarioId: string;
  scenarioName: string;
  workspaceMode: string;
  participants: AssignmentParticipant[];
}

function toDiscrepancies(dtos: DiscrepancyDto[]): Discrepancy[] {
  return dtos.map(({ path, expected, actual, reason }) => ({ path, expected, actual, reason }));
}

export function toReviewSession(dto: TrainingSessionDto): ReviewSession {
  const expertScore = decimal(dto.expert_score);

  return {
    id: dto.id,
    assignmentId: dto.assignment_id,
    attemptNumber: dto.attempt_number,
    status: dto.status,
    startedAt: dto.started_at,
    completedAt: dto.completed_at,
    score: decimal(dto.score),
    passed: dto.passed,
    passingScore: decimal(dto.result.passing_score ?? null),
    abortReason: dto.result.abort_reason ?? null,
    expertAssessment:
      expertScore === null || dto.expert_passed === null
        ? null
        : {
            score: expertScore,
            passed: dto.expert_passed,
            comment: dto.expert_comment,
            evaluatedBy: dto.expert_evaluated_by,
            evaluatedAt: dto.expert_evaluated_at,
          },
  };
}

function earliestAnswer(calls: Pick<ExpertReviewCallDto, "answered_at">[]): string | null {
  const answered = calls
    .map((call) => call.answered_at)
    .filter((answeredAt): answeredAt is string => answeredAt !== null)
    .sort((first, second) => Date.parse(first) - Date.parse(second));

  return answered[0] ?? null;
}

const OUTGOING_CALL_STARTED = "OUTGOING_CALL_STARTED";

function toOutgoingCalls(
  calls: ExpertReviewOutgoingCallDto[],
  actions: TrainingActionDto[],
): ReviewOutgoingCall[] {
  const operators = new Map(
    actions.flatMap((action) =>
      action.action_type === OUTGOING_CALL_STARTED && action.entity_id !== null
        ? [[action.entity_id, action.actor_user_id] as const]
        : [],
    ),
  );

  return calls.map((call) => ({
    trainingCallId: call.id,
    incidentCardId: call.card_id,
    operatorUserId: operators.get(call.id) ?? null,
    status: call.status,
    interlocutorRole: call.interlocutor_role,
    startedAt: call.started_at,
    completedAt: call.completed_at,
  }));
}

export function toExpertReviewContext(dto: ExpertReviewContextDto): ExpertReviewContext {
  return {
    session: toReviewSession(dto.session),
    scenarioSnapshot: dto.scenario_snapshot,
    participantIds: dto.participant_ids,
    cards: dto.cards.map((card) => ({
      scenarioCardKey: card.scenario_card_key,
      incidentCardId: card.incident_card_id,
      expectedResult: card.expected_result,
      currentState: card.current_state,
      automaticResult: card.automatic_result && {
        score: card.automatic_result.score,
        passed: card.automatic_result.passed,
        discrepancies: toDiscrepancies(card.automatic_result.discrepancies),
        evaluatedAt: card.automatic_result.evaluated_at,
      },
    })),
    incomingCalls: dto.incoming_calls.map((call) => ({
      scenarioItemKey: call.scenario_item_key,
      trainingCallId: call.training_call_id,
      incidentCardId: call.incident_card_id,
      status: call.status,
      ringingAt: call.ringing_at,
      answeredAt: call.answered_at,
      completedAt: call.completed_at,
      expectedResult: call.expected_result,
      currentState: call.current_state,
      automaticResult: call.automatic_result && {
        score: call.automatic_result.score,
        passed: call.automatic_result.passed,
        discrepancies: toDiscrepancies(call.automatic_result.discrepancies),
        evaluatedAt: null,
      },
    })),
    outgoingCalls: toOutgoingCalls(dto.outgoing_calls, dto.actions),
    actions: toActionTimeline(dto.actions, earliestAnswer(dto.incoming_calls)),
  };
}

export function toReviewAssignment(dto: ScenarioAssignmentDto): ReviewAssignment {
  return {
    id: dto.id,
    scenarioId: dto.scenario_id,
    scenarioName: dto.scenario_name,
    workspaceMode: dto.workspace_mode,
    participants: dto.participants.map((participant) => ({
      userId: participant.user_id,
      role: participant.participant_role,
      positionCode: participant.position_code,
      status: participant.status,
    })),
  };
}
