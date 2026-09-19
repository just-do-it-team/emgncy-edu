from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from s112.api.schemas import CardCreate, OrmModel
from s112.common.enums import (
    LaunchPolicy,
    ScenarioCardSourceType,
    ScenarioStatus,
    ScenarioTriggerType,
    WorkspaceMode,
)


class RequiredAction(BaseModel):
    action_type: str = Field(min_length=1, max_length=100)
    deadline_seconds: int | None = Field(default=None, ge=0)
    parameters: dict[str, Any] = Field(default_factory=dict)


class ExpectedResult(BaseModel):
    """Expected state and actions. Forbidden actions are intentionally unsupported."""

    model_config = ConfigDict(extra="forbid")

    final_state: dict[str, Any] = Field(default_factory=dict)
    required_actions: list[RequiredAction] = Field(default_factory=list)


class ScenarioCardDefinition(BaseModel):
    key: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.-]+$")
    trigger_type: ScenarioTriggerType
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    source_type: ScenarioCardSourceType
    template_id: uuid.UUID | None = None
    initial_card: CardCreate | None = None
    expected_result: ExpectedResult | None = None
    evaluation_rules: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_source_and_trigger(self) -> "ScenarioCardDefinition":
        if self.source_type is ScenarioCardSourceType.TEMPLATE:
            if self.template_id is None:
                raise ValueError("template_id is required for TEMPLATE source")
            if self.initial_card is not None or self.expected_result is not None:
                raise ValueError("TEMPLATE source must not duplicate template card data")
        elif self.source_type is ScenarioCardSourceType.INLINE:
            if self.initial_card is None or self.expected_result is None:
                raise ValueError("INLINE source requires initial_card and expected_result")
            if self.template_id is not None:
                raise ValueError("INLINE source must not contain template_id")
        else:
            raise ValueError("SNAPSHOT source is reserved for assigned scenarios")

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
        keys = [card.key for card in self.cards]
        if len(keys) != len(set(keys)):
            raise ValueError("Scenario card keys must be unique")
        known = set(keys)
        for card in self.cards:
            if card.trigger_type is ScenarioTriggerType.AFTER_ACTION:
                dependency = card.trigger_config["card_key"]
                if dependency not in known:
                    raise ValueError(f"Unknown AFTER_ACTION card_key: {dependency}")
                if dependency == card.key:
                    raise ValueError("A scenario card cannot depend on itself")
        return self


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


class TrainingScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    difficulty: int = Field(ge=1, le=5)
    estimated_duration_seconds: int = Field(gt=0)
    workspace_mode: WorkspaceMode = WorkspaceMode.INDIVIDUAL
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
        return self


class TrainingScenarioUpdate(BaseModel):
    expected_revision: int = Field(ge=1)
    updated_by: uuid.UUID
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    difficulty: int | None = Field(default=None, ge=1, le=5)
    estimated_duration_seconds: int | None = Field(default=None, gt=0)
    workspace_mode: WorkspaceMode | None = None
    min_participants: int | None = Field(default=None, ge=1, le=100)
    max_participants: int | None = Field(default=None, ge=1, le=100)
    definition: ScenarioDefinition | None = None
    status: ScenarioStatus | None = None


class TrainingScenarioResponse(OrmModel):
    id: uuid.UUID
    name: str
    description: str | None
    difficulty: int
    estimated_duration_seconds: int
    cards_count: int
    workspace_mode: str
    min_participants: int
    max_participants: int
    definition: dict[str, Any]
    revision: int
    status: str
    created_by: uuid.UUID
    updated_by: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ScenarioAssignmentCreate(BaseModel):
    scenario_id: uuid.UUID
    participant_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    assigned_by: uuid.UUID
    launch_policy: LaunchPolicy = LaunchPolicy.STUDENT_SELF_START
    max_attempts: int = Field(default=1, ge=1, le=100)
    available_from: datetime | None = None
    due_at: datetime | None = None

    @model_validator(mode="after")
    def validate_assignment(self) -> "ScenarioAssignmentCreate":
        if len(self.participant_ids) != len(set(self.participant_ids)):
            raise ValueError("participant_ids must be unique")
        if self.available_from and self.due_at and self.due_at <= self.available_from:
            raise ValueError("due_at must be later than available_from")
        return self


class AssignmentParticipantResponse(OrmModel):
    user_id: uuid.UUID
    status: str
    ready_at: datetime | None
    completed_at: datetime | None


class ScenarioAssignmentResponse(OrmModel):
    id: uuid.UUID
    scenario_id: uuid.UUID
    scenario_revision: int
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
    started_at: datetime
    completed_at: datetime | None
    score: Decimal | None
    passed: bool | None
    result: dict[str, Any]


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
