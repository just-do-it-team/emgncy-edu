from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from s112.api.schemas import CardCreate, OrmModel
from s112.common.enums import (
    LaunchPolicy,
    ScenarioCardSourceType,
    ScenarioCompletionPolicy,
    ScenarioItemType,
    ScenarioStatus,
    ScenarioTriggerType,
    WorkspaceMode,
)
from s112.semantic_evaluation.rules import validate_evaluation_rules


class RequiredAction(BaseModel):
    action_type: str = Field(min_length=1, max_length=100)
    deadline_seconds: int | None = Field(default=None, ge=0)
    parameters: dict[str, Any] = Field(default_factory=dict)


class ExpectedResult(BaseModel):
    """Expected state and actions. Forbidden actions are intentionally unsupported."""

    model_config = ConfigDict(extra="forbid")

    final_state: dict[str, Any] = Field(default_factory=dict)
    required_actions: list[RequiredAction] = Field(default_factory=list)


class InitialIncomingCall(BaseModel):
    """Prompt data kept server-side and supplied to the caller LLM."""

    model_config = ConfigDict(extra="forbid")

    initial_utterance: str = Field(min_length=1, max_length=10_000)
    context: dict[str, Any] = Field(default_factory=dict)

    @field_validator("initial_utterance")
    @classmethod
    def normalize_initial_utterance(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("initial_utterance must not be blank")
        return normalized


class ScenarioCardDefinition(BaseModel):
    key: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.-]+$")
    item_type: ScenarioItemType = ScenarioItemType.INCIDENT_CARD
    trigger_type: ScenarioTriggerType
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    source_type: ScenarioCardSourceType
    template_id: uuid.UUID | None = None
    initial_card: CardCreate | None = None
    initial_call: InitialIncomingCall | None = None
    expected_result: ExpectedResult | None = None
    evaluation_rules: dict[str, Any] = Field(default_factory=dict)

    @field_validator("evaluation_rules")
    @classmethod
    def validate_known_evaluation_rules(
        cls, value: dict[str, Any]
    ) -> dict[str, Any]:
        return validate_evaluation_rules(value)

    @model_validator(mode="after")
    def validate_source_and_trigger(self) -> "ScenarioCardDefinition":
        if self.source_type is ScenarioCardSourceType.TEMPLATE:
            if self.template_id is None:
                raise ValueError("template_id is required for TEMPLATE source")
            if (
                self.initial_card is not None
                or self.initial_call is not None
                or self.expected_result is not None
            ):
                raise ValueError("TEMPLATE source must not duplicate template data")
        elif self.source_type is ScenarioCardSourceType.INLINE:
            payload = (
                self.initial_card
                if self.item_type is ScenarioItemType.INCIDENT_CARD
                else self.initial_call
            )
            if payload is None or self.expected_result is None:
                raise ValueError("INLINE source requires an initial payload and expected_result")
            if self.template_id is not None:
                raise ValueError("INLINE source must not contain template_id")
        else:
            raise ValueError("SNAPSHOT source is reserved for assigned scenarios")

        if self.item_type is ScenarioItemType.INCIDENT_CARD:
            if self.initial_call is not None:
                raise ValueError("INCIDENT_CARD item must not contain initial_call")
        elif self.item_type is ScenarioItemType.INCOMING_CALL:
            if self.initial_card is not None:
                raise ValueError("INCOMING_CALL item must not contain initial_card")
            if self.evaluation_rules:
                raise ValueError(
                    "INCOMING_CALL semantic reference belongs in expected_result"
                )

        if self.trigger_type is ScenarioTriggerType.TIME_OFFSET:
            offset = self.trigger_config.get("offset_seconds")
            if not isinstance(offset, int) or isinstance(offset, bool) or offset < 0:
                raise ValueError("TIME_OFFSET requires non-negative integer offset_seconds")
        elif self.trigger_type is ScenarioTriggerType.AFTER_ACTION:
            card_key = self.trigger_config.get("card_key")
            action_type = self.trigger_config.get("action_type")
            delay = self.trigger_config.get("delay_seconds", 0)
            if not isinstance(card_key, str) or not card_key:
                raise ValueError("AFTER_ACTION requires card_key")
            if not isinstance(action_type, str) or not action_type:
                raise ValueError("AFTER_ACTION requires action_type")
            if not isinstance(delay, int) or isinstance(delay, bool) or delay < 0:
                raise ValueError("AFTER_ACTION delay_seconds must be a non-negative integer")
        return self


class ScenarioDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=1, ge=1)
    cards: list[ScenarioCardDefinition] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_card_keys(self) -> "ScenarioDefinition":
        if self.schema_version < 2 and any(
            item.item_type is ScenarioItemType.INCOMING_CALL for item in self.cards
        ):
            raise ValueError("INCOMING_CALL items require scenario schema_version 2")
        keys = [card.key for card in self.cards]
        if len(keys) != len(set(keys)):
            raise ValueError("Scenario item keys must be unique")
        known = set(keys)
        for card in self.cards:
            if card.trigger_type is ScenarioTriggerType.AFTER_ACTION:
                dependency = card.trigger_config["card_key"]
                if dependency not in known:
                    raise ValueError(f"Unknown AFTER_ACTION card_key: {dependency}")
                if dependency == card.key:
                    raise ValueError("A scenario item cannot depend on itself")
        return self


def strip_scenario_card_runtime_fields(definition: dict[str, Any]) -> dict[str, Any]:
    """Remove fields that are assigned only when a scenario session is running."""

    result = {**definition}
    cards: list[Any] = []
    for value in definition.get("cards", []):
        if not isinstance(value, dict):
            cards.append(value)
            continue
        card = {**value}
        initial_card = card.get("initial_card")
        if isinstance(initial_card, dict):
            card["initial_card"] = {
                key: item
                for key, item in initial_card.items()
                if key not in {"workspace_id", "request_id"}
            }
        cards.append(card)
    result["cards"] = cards
    return result


class CardTemplateCreate(BaseModel):
    template_key: uuid.UUID | None = None
    version: int = Field(default=1, ge=1)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    difficulty: int = Field(default=1, ge=1, le=5)
    initial_card: CardCreate
    expected_result: ExpectedResult
    evaluation_rules: dict[str, Any] = Field(default_factory=dict)
    created_by: uuid.UUID

    @field_validator("evaluation_rules")
    @classmethod
    def validate_known_evaluation_rules(
        cls, value: dict[str, Any]
    ) -> dict[str, Any]:
        return validate_evaluation_rules(value)


class CardTemplateResponse(OrmModel):
    id: uuid.UUID
    template_key: uuid.UUID
    version: int
    name: str
    description: str | None
    difficulty: int
    initial_card: dict[str, Any]
    expected_result: dict[str, Any]
    evaluation_rules: dict[str, Any]
    is_active: bool
    created_by: uuid.UUID
    created_at: datetime


class CardTemplateDeleteRequest(BaseModel):
    deleted_by: uuid.UUID


class IncomingCallTemplateCreate(BaseModel):
    template_key: uuid.UUID | None = None
    version: int = Field(default=1, ge=1)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    difficulty: int = Field(default=1, ge=1, le=5)
    initial_call: InitialIncomingCall
    expected_result: ExpectedResult
    created_by: uuid.UUID


class IncomingCallTemplateResponse(OrmModel):
    id: uuid.UUID
    template_key: uuid.UUID
    version: int
    name: str
    description: str | None
    difficulty: int
    initial_call: dict[str, Any]
    expected_result: dict[str, Any]
    is_active: bool
    created_by: uuid.UUID
    created_at: datetime


class IncomingCallTemplateDeleteRequest(BaseModel):
    deleted_by: uuid.UUID


class TrainingScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    difficulty: int = Field(ge=1, le=5)
    estimated_duration_seconds: int = Field(gt=0)
    workspace_mode: WorkspaceMode = WorkspaceMode.INDIVIDUAL
    completion_policy: ScenarioCompletionPolicy | None = None
    min_participants: int = Field(default=1, ge=1, le=100)
    max_participants: int = Field(default=1, ge=1, le=100)
    definition: ScenarioDefinition
    status: ScenarioStatus = ScenarioStatus.DRAFT
    created_by: uuid.UUID

    @model_validator(mode="after")
    def validate_participants(self) -> "TrainingScenarioCreate":
        if self.max_participants < self.min_participants:
            raise ValueError("max_participants must be greater than or equal to min_participants")
        if self.workspace_mode is WorkspaceMode.INDIVIDUAL and (
            self.min_participants != 1 or self.max_participants != 1
        ):
            raise ValueError("INDIVIDUAL scenario requires exactly one participant")
        if self.completion_policy is None:
            self.completion_policy = (
                ScenarioCompletionPolicy.TEACHER_ONLY
                if self.workspace_mode is WorkspaceMode.SHARED
                else ScenarioCompletionPolicy.STUDENT_CONFIRM
            )
        if (
            self.workspace_mode is WorkspaceMode.SHARED
            and self.completion_policy is not ScenarioCompletionPolicy.TEACHER_ONLY
        ):
            raise ValueError("SHARED scenario requires TEACHER_ONLY completion policy")
        if (
            self.workspace_mode is WorkspaceMode.INDIVIDUAL
            and self.completion_policy is ScenarioCompletionPolicy.TEACHER_ONLY
        ):
            raise ValueError("INDIVIDUAL scenario cannot use TEACHER_ONLY completion policy")
        return self


class TrainingScenarioUpdate(BaseModel):
    expected_revision: int = Field(ge=1)
    updated_by: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    difficulty: int | None = Field(default=None, ge=1, le=5)
    estimated_duration_seconds: int | None = Field(default=None, gt=0)
    workspace_mode: WorkspaceMode | None = None
    completion_policy: ScenarioCompletionPolicy | None = None
    min_participants: int | None = Field(default=None, ge=1, le=100)
    max_participants: int | None = Field(default=None, ge=1, le=100)
    definition: ScenarioDefinition | None = None
    status: ScenarioStatus | None = None


class ScenarioDeleteRequest(BaseModel):
    deleted_by: uuid.UUID
    expected_revision: int = Field(ge=1)


class TrainingScenarioResponse(OrmModel):
    id: uuid.UUID
    name: str
    description: str | None
    difficulty: int
    estimated_duration_seconds: int
    cards_count: int
    workspace_mode: str
    completion_policy: str
    min_participants: int
    max_participants: int
    definition: dict[str, Any]
    revision: int
    status: str
    created_by: uuid.UUID
    updated_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    @field_validator("definition", mode="before")
    @classmethod
    def hide_runtime_card_fields(cls, value: dict[str, Any]) -> dict[str, Any]:
        return strip_scenario_card_runtime_fields(value)


class ScenarioAssignmentCreate(BaseModel):
    scenario_id: uuid.UUID
    participant_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    participant_positions: dict[uuid.UUID, str] = Field(default_factory=dict)
    assigned_by: uuid.UUID
    launch_policy: LaunchPolicy = LaunchPolicy.STUDENT_SELF_START
    max_attempts: int = Field(default=1, ge=1, le=100)
    available_from: datetime | None = None
    due_at: datetime | None = None

    @model_validator(mode="after")
    def validate_assignment(self) -> "ScenarioAssignmentCreate":
        if len(self.participant_ids) != len(set(self.participant_ids)):
            raise ValueError("participant_ids must be unique")
        unknown_positions = set(self.participant_positions) - set(self.participant_ids)
        if unknown_positions:
            raise ValueError("participant_positions contains users not in participant_ids")
        missing_positions = set(self.participant_ids) - set(self.participant_positions)
        if missing_positions:
            raise ValueError("participant_positions must contain every participant")
        if any(not code.strip() for code in self.participant_positions.values()):
            raise ValueError("participant position_code must not be blank")
        self.participant_positions = {
            user_id: code.strip()
            for user_id, code in self.participant_positions.items()
        }
        if self.available_from and self.due_at and self.due_at <= self.available_from:
            raise ValueError("due_at must be later than available_from")
        return self


class AssignmentParticipantResponse(OrmModel):
    user_id: uuid.UUID
    status: str
    position_code: str | None
    ready_at: datetime | None
    completed_at: datetime | None


class ScenarioAssignmentResponse(OrmModel):
    id: uuid.UUID
    scenario_id: uuid.UUID
    scenario_revision: int
    assignment_batch_id: uuid.UUID | None = None
    assigned_by: uuid.UUID
    workspace_mode: str
    launch_policy: str
    max_attempts: int
    status: str
    available_from: datetime | None
    due_at: datetime | None
    created_at: datetime
    participants: list[AssignmentParticipantResponse] = Field(default_factory=list)


class StartAssignmentRequest(BaseModel):
    user_id: uuid.UUID


class StartAssignmentResponse(BaseModel):
    session_id: uuid.UUID
    workspace_id: uuid.UUID
    assignment_id: uuid.UUID
    attempt_number: int
    status: str
    started_at: datetime
    idempotent_replay: bool = False


class SessionCompleteRequest(BaseModel):
    user_id: uuid.UUID


class TrainingSessionResponse(OrmModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    attempt_number: int
    status: str
    completion_policy: str
    completion_state: dict[str, Any]
    completion_state_revision: int
    ready_to_complete_at: datetime | None
    completed_automatically: bool
    started_at: datetime
    completed_at: datetime | None
    score: Decimal | None
    passed: bool | None
    result: dict[str, Any]
    expert_score: Decimal | None
    expert_passed: bool | None
    expert_comment: str | None
    expert_evaluated_by: uuid.UUID | None
    expert_evaluated_at: datetime | None


class CompletionBlocker(BaseModel):
    code: str
    message: str
    scenario_card_key: str | None = None
    incident_card_id: uuid.UUID | None = None
    service_code: str | None = None
    audio_message_id: uuid.UUID | None = None
    sequence_no: int | None = None
    scenario_item_key: str | None = None
    training_call_id: uuid.UUID | None = None


class PendingServiceDecision(BaseModel):
    scenario_card_key: str
    incident_card_id: uuid.UUID
    service_code: str


class SessionCompletionReadinessResponse(BaseModel):
    training_session_id: uuid.UUID
    status: str
    completion_policy: str
    can_complete: bool
    ready_to_complete_at: datetime | None
    cards_total: int
    cards_pending: int
    cards_emitted: int
    cards_failed: int
    cards_cancelled: int
    calls_total: int = 0
    calls_pending: int = 0
    calls_ringing: int = 0
    calls_active: int = 0
    calls_completed: int = 0
    calls_failed: int = 0
    calls_cancelled: int = 0
    decisions_required: int
    decisions_completed: int
    audio_messages_total: int = 0
    audio_messages_pending: int = 0
    audio_messages_failed: int = 0
    semantic_evaluations_total: int = 0
    semantic_evaluations_pending: int = 0
    semantic_evaluations_failed: int = 0
    pending_card_keys: list[str]
    failed_card_keys: list[str]
    cancelled_card_keys: list[str]
    waiting_for_decision: list[PendingServiceDecision]
    next_scheduled_at: datetime | None
    blockers: list[CompletionBlocker]
    revision: int


class LearningGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    teacher_id: uuid.UUID
    student_ids: list[uuid.UUID] = Field(default_factory=list, max_length=1000)

    @field_validator("student_ids")
    @classmethod
    def validate_unique_students(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) != len(set(value)):
            raise ValueError("student_ids must be unique")
        return value


class LearningGroupUpdate(BaseModel):
    actor_id: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None


class LearningGroupMembersUpdate(BaseModel):
    actor_id: uuid.UUID
    student_ids: list[uuid.UUID] = Field(min_length=1, max_length=1000)

    @field_validator("student_ids")
    @classmethod
    def validate_unique_students(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) != len(set(value)):
            raise ValueError("student_ids must be unique")
        return value


class LearningGroupMemberResponse(BaseModel):
    student_id: uuid.UUID
    display_name: str
    joined_at: datetime
    removed_at: datetime | None


class LearningGroupResponse(OrmModel):
    id: uuid.UUID
    name: str
    description: str | None
    teacher_id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime
    members: list[LearningGroupMemberResponse] = Field(default_factory=list)


class GroupScenarioAssignmentCreate(BaseModel):
    scenario_id: uuid.UUID
    assigned_by: uuid.UUID
    participant_positions: dict[uuid.UUID, str] = Field(default_factory=dict)
    launch_policy: LaunchPolicy = LaunchPolicy.STUDENT_SELF_START
    max_attempts: int = Field(default=1, ge=1, le=100)
    available_from: datetime | None = None
    due_at: datetime | None = None

    @model_validator(mode="after")
    def validate_dates_and_positions(self) -> "GroupScenarioAssignmentCreate":
        if any(not code.strip() for code in self.participant_positions.values()):
            raise ValueError("participant position_code must not be blank")
        self.participant_positions = {
            user_id: code.strip()
            for user_id, code in self.participant_positions.items()
        }
        if self.available_from and self.due_at and self.due_at <= self.available_from:
            raise ValueError("due_at must be later than available_from")
        return self


class AssignmentBatchResponse(OrmModel):
    id: uuid.UUID
    group_id: uuid.UUID
    scenario_id: uuid.UUID
    assigned_by: uuid.UUID
    launch_policy: str
    max_attempts: int
    available_from: datetime | None
    due_at: datetime | None
    created_at: datetime
    assignments: list[ScenarioAssignmentResponse] = Field(default_factory=list)


class ExpertAssessmentUpdate(BaseModel):
    teacher_id: uuid.UUID
    score: Decimal = Field(ge=0, le=100, max_digits=5, decimal_places=2)
    passed: bool
    comment: str | None = Field(default=None, max_length=10000)

    @field_validator("comment")
    @classmethod
    def normalize_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class ExpertReviewCardResponse(BaseModel):
    scenario_card_key: str
    incident_card_id: uuid.UUID | None
    expected_result: dict[str, Any]
    current_state: dict[str, Any] | None
    automatic_result: dict[str, Any] | None


class ExpertReviewCallResponse(BaseModel):
    scenario_item_key: str
    training_call_id: uuid.UUID
    incident_card_id: uuid.UUID | None
    status: str
    expected_result: dict[str, Any]
    current_state: dict[str, Any] | None
    automatic_result: dict[str, Any] | None


class TrainingActionResponse(OrmModel):
    id: uuid.UUID
    training_session_id: uuid.UUID
    workspace_id: uuid.UUID
    actor_user_id: uuid.UUID | None
    incident_card_id: uuid.UUID | None
    action_type: str
    entity_type: str | None
    entity_id: str | None
    occurred_at: datetime
    result: str
    before_state: dict[str, Any] | None
    after_state: dict[str, Any] | None
    details: dict[str, Any]


class ExpertReviewContextResponse(BaseModel):
    session: TrainingSessionResponse
    scenario_snapshot: dict[str, Any]
    participant_ids: list[uuid.UUID]
    cards: list[ExpertReviewCardResponse]
    incoming_calls: list[ExpertReviewCallResponse] = Field(default_factory=list)
    actions: list[TrainingActionResponse]


class StudentTrainingHistoryItem(BaseModel):
    session_id: uuid.UUID
    assignment_id: uuid.UUID
    assignment_batch_id: uuid.UUID | None
    group_id: uuid.UUID | None
    group_name: str | None
    scenario_id: uuid.UUID
    scenario_name: str
    attempt_number: int
    status: str
    started_at: datetime
    completed_at: datetime | None
    automatic_score: Decimal | None
    automatic_passed: bool | None
    automatic_result: dict[str, Any]
    expert_score: Decimal | None
    expert_passed: bool | None
    final_score: Decimal | None
    final_passed: bool | None
    expert_comment: str | None
    expert_evaluated_by: uuid.UUID | None
    expert_evaluated_at: datetime | None


class TeacherMonitoringParticipant(BaseModel):
    user_id: uuid.UUID
    display_name: str
    status: str
    position_code: str | None


class TeacherMonitoringSession(BaseModel):
    session_id: uuid.UUID
    assignment_id: uuid.UUID
    assignment_batch_id: uuid.UUID | None
    group_id: uuid.UUID | None
    group_name: str | None
    scenario_id: uuid.UUID
    scenario_name: str
    workspace_id: uuid.UUID
    status: str
    attempt_number: int
    started_at: datetime
    completed_at: datetime | None
    score: Decimal | None
    passed: bool | None
    cards_total: int
    cards_pending: int
    cards_emitted: int
    calls_total: int = 0
    calls_pending: int = 0
    calls_ringing: int = 0
    calls_active: int = 0
    calls_completed: int = 0
    pending_card_keys: list[str]
    emitted_card_keys: list[str]
    successful_actions: int
    rejected_actions: int
    last_activity_at: datetime | None
    participants: list[TeacherMonitoringParticipant]


class ManualCardReleaseRequest(BaseModel):
    user_id: uuid.UUID


class ScheduledCardResponse(OrmModel):
    id: uuid.UUID
    training_session_id: uuid.UUID
    workspace_id: uuid.UUID
    scenario_card_key: str
    trigger_type: str
    trigger_config: dict[str, Any]
    status: str
    incident_card_id: uuid.UUID | None
    scheduled_at: datetime | None
    emitted_at: datetime | None
    attempts: int
    last_error: str | None


class TrainingCallResponse(OrmModel):
    id: uuid.UUID
    training_session_id: uuid.UUID
    workspace_id: uuid.UUID
    scenario_item_key: str
    trigger_type: str
    trigger_config: dict[str, Any]
    status: str
    incident_card_id: uuid.UUID | None
    scheduled_at: datetime | None
    ringing_at: datetime | None
    answered_at: datetime | None
    completed_at: datetime | None
    attempts: int
    last_error: str | None


class TrainingCallActionRequest(BaseModel):
    user_id: uuid.UUID


class TrainingCallCardLinkRequest(BaseModel):
    user_id: uuid.UUID
    incident_card_id: uuid.UUID
