from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator, model_validator

from s112.api.schemas import CardCreate, CardQuestionnaire, OperatorClassification, OrmModel
from s112.common.enums import (
    CardStatus,
    LaunchPolicy,
    ParticipantRole,
    ScenarioCardSourceType,
    ScenarioCompletionPolicy,
    ScenarioItemType,
    ScenarioMode,
    ScenarioStatus,
    ScenarioTriggerActionType,
    ScenarioTriggerType,
    ServiceResponseStatus,
    TemplateGenerationStatus,
    TemplateStatus,
    WorkspaceMode,
)
from s112.semantic_evaluation.rules import OutboundCallRule
from s112.domain.rules import (
    validate_service_status_comment,
    validate_service_status_transition,
)


class ExpectedCardState(BaseModel):
    """The complete, assessable state of the incident card after handling."""

    model_config = ConfigDict(extra="forbid")

    classification: OperatorClassification
    description: str
    questionnaire: CardQuestionnaire | None = None
    applicant_full_name: str | None = Field(default=None, max_length=255)
    automatic_phone_number: str | None = Field(default=None, max_length=64)
    provided_phone_number: str | None = Field(default=None, max_length=64)
    location_phone_number: str | None = Field(default=None, max_length=64)
    reported_address: str | None = None
    incident_address: str | None = None
    victims_count: int | None = Field(default=None, ge=0)
    current_status: CardStatus
    services: list[str]
    service_statuses: dict[str, ServiceResponseStatus]

    @model_validator(mode="after")
    def validate_services(self) -> "ExpectedCardState":
        if any(not code or code != code.strip() for code in self.services):
            raise ValueError("expected_result.card.services contains a blank or padded code")
        if len(self.services) != len(set(self.services)):
            raise ValueError("expected_result.card.services must be unique")
        if set(self.service_statuses) != set(self.services):
            raise ValueError(
                "expected_result.card.service_statuses must contain exactly the listed services"
            )
        if set(self.services) & set(self.classification.excluded_service_codes):
            raise ValueError(
                "expected_result.card.services contains a classification-excluded service"
            )
        return self


class ExpectedServiceStatusChange(BaseModel):
    """One operator-authored service status change expected during training."""

    model_config = ConfigDict(extra="forbid")

    status: ServiceResponseStatus
    comment: str | None = Field(default=None, max_length=10_000)
    unit_number: str | None = Field(default=None, max_length=64)

    @field_validator("comment", "unit_number")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class ExpectedResult(BaseModel):
    """Expected card state and, when applicable, the expected outbound call."""

    model_config = ConfigDict(extra="forbid")

    card: ExpectedCardState | None = None
    outbound_call: OutboundCallRule | None = None
    service_status_history: dict[str, list[ExpectedServiceStatusChange]] | None = None

    @model_validator(mode="after")
    def validate_service_status_history(self) -> "ExpectedResult":
        if self.service_status_history is None:
            return self
        if self.card is None:
            raise ValueError("service_status_history requires expected_result.card")
        if set(self.service_status_history) != set(self.card.services):
            raise ValueError(
                "service_status_history must contain every expected card service"
            )
        for service_code, changes in self.service_status_history.items():
            if not changes:
                raise ValueError(
                    f"service_status_history[{service_code!r}] must not be empty"
                )
            current = ServiceResponseStatus.ADDED.value
            for change in changes:
                try:
                    validate_service_status_transition(current, change.status)
                    validate_service_status_comment(change.status, change.comment)
                except ValueError as exc:
                    raise ValueError(
                        f"Invalid service status history for {service_code}: {exc}"
                    ) from exc
                current = change.status.value
            if self.card.service_statuses.get(service_code) != changes[-1].status:
                raise ValueError(
                    f"Final service status for {service_code} does not match its history"
                )
        return self


class InitialIncomingCall(BaseModel):
    """Prompt data kept server-side and supplied to the caller LLM."""

    model_config = ConfigDict(extra="forbid")

    initial_utterance: str = Field(min_length=1, max_length=10_000)
    automatic_phone_number: str | None = Field(default=None, max_length=64)

    @field_validator("initial_utterance")
    @classmethod
    def normalize_initial_utterance(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("initial_utterance must not be blank")
        return normalized


class TimeOffsetTriggerConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    offset_seconds: int = Field(ge=0)


class AfterActionTriggerConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    card_key: str = Field(min_length=1, max_length=100)
    action_type: ScenarioTriggerActionType = Field(strict=False)
    delay_seconds: int = Field(default=0, ge=0)


class ScenarioCardDefinition(BaseModel):
    key: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.-]+$")
    item_type: ScenarioItemType = ScenarioItemType.INCIDENT_CARD
    trigger_type: ScenarioTriggerType
    trigger_config: TimeOffsetTriggerConfig | AfterActionTriggerConfig
    source_type: ScenarioCardSourceType
    template_id: uuid.UUID | None = None
    initial_card: CardCreate | None = None
    expected_result: ExpectedResult | None = None

    @model_validator(mode="before")
    @classmethod
    def reject_initial_call(cls, value: Any) -> Any:
        if isinstance(value, dict) and "initial_call" in value:
            raise ValueError("initial_call belongs to an incoming call template, not a scenario")
        return value

    @model_validator(mode="after")
    def validate_source_and_trigger(self) -> "ScenarioCardDefinition":
        if self.source_type is ScenarioCardSourceType.TEMPLATE:
            if self.template_id is None:
                raise ValueError("template_id is required for TEMPLATE source")
            if self.initial_card is not None or self.expected_result is not None:
                raise ValueError("TEMPLATE source must not duplicate template data")
        elif self.source_type is ScenarioCardSourceType.INLINE:
            if self.item_type is ScenarioItemType.INCOMING_CALL:
                raise ValueError("INCOMING_CALL item requires an incoming call template")
            if self.initial_card is None or self.expected_result is None:
                raise ValueError("INLINE source requires initial_card and expected_result")
            if self.template_id is not None:
                raise ValueError("INLINE source must not contain template_id")
        else:
            raise ValueError("SNAPSHOT source is reserved for assigned scenarios")

        if self.item_type is ScenarioItemType.INCIDENT_CARD:
            if self.expected_result is not None and self.expected_result.card is None:
                raise ValueError("INCIDENT_CARD item requires expected_result.card")
        elif self.item_type is ScenarioItemType.INCOMING_CALL:
            if self.initial_card is not None:
                raise ValueError("INCOMING_CALL item must not contain initial_card")
            if self.expected_result is not None:
                if self.expected_result.card is None:
                    raise ValueError(
                        "INCOMING_CALL item requires expected_result.card"
                    )
                if self.expected_result.outbound_call is not None:
                    raise ValueError(
                        "INCOMING_CALL item cannot require an outbound call"
                    )
                if self.expected_result.service_status_history is not None:
                    raise ValueError(
                        "INCOMING_CALL item cannot require DDS service status history"
                    )

        if self.trigger_type is ScenarioTriggerType.TIME_OFFSET:
            if not isinstance(self.trigger_config, TimeOffsetTriggerConfig):
                raise ValueError("TIME_OFFSET requires offset_seconds")
        elif self.trigger_type is ScenarioTriggerType.AFTER_ACTION:
            if not isinstance(self.trigger_config, AfterActionTriggerConfig):
                raise ValueError("AFTER_ACTION requires card_key and action_type")
        else:
            raise ValueError("Only TIME_OFFSET and AFTER_ACTION triggers are supported")
        return self


class ProceduralTemplatePool(BaseModel):
    """Strict allow-list and classifier group filters for procedural card selection."""

    model_config = ConfigDict(extra="forbid")

    template_ids: list[uuid.UUID] | None = Field(
        default=None, min_length=1, max_length=500
    )
    classification_group_codes: list[int] | None = Field(
        default=None, min_length=1, max_length=100
    )

    @field_validator("template_ids")
    @classmethod
    def validate_unique_template_ids(
        cls, value: list[uuid.UUID] | None
    ) -> list[uuid.UUID] | None:
        if value is not None and len(value) != len(set(value)):
            raise ValueError("template_ids must be unique")
        return value

    @field_validator("classification_group_codes")
    @classmethod
    def validate_classification_group_codes(
        cls, value: list[int] | None
    ) -> list[int] | None:
        if value is not None:
            if any(item <= 0 for item in value):
                raise ValueError("classification_group_codes must contain positive integers")
            if len(value) != len(set(value)):
                raise ValueError("classification_group_codes must be unique")
        return value


class ProceduralCardGeneration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(
        default="procedural-cards",
        min_length=1,
        max_length=80,
        pattern=r"^[A-Za-z0-9_.-]+$",
    )
    target_count: int = Field(ge=1, le=100)
    template_pool: ProceduralTemplatePool = Field(
        default_factory=ProceduralTemplatePool
    )


class ScenarioDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(default=1, ge=1)
    mode: ScenarioMode = ScenarioMode.STATIC
    cards: list[ScenarioCardDefinition] = Field(default_factory=list)
    procedural_generation: ProceduralCardGeneration | None = None

    @model_validator(mode="after")
    def validate_card_keys(self) -> "ScenarioDefinition":
        if self.mode is ScenarioMode.STATIC:
            if not self.cards:
                raise ValueError("STATIC scenario requires at least one card")
            if self.procedural_generation is not None:
                raise ValueError("STATIC scenario must not define procedural_generation")
        elif self.mode is ScenarioMode.PROCEDURAL:
            if self.cards:
                raise ValueError("PROCEDURAL scenario must not contain static cards")
            if self.procedural_generation is None:
                raise ValueError("PROCEDURAL scenario requires procedural_generation")
        elif self.mode is ScenarioMode.HYBRID:
            if not self.cards or self.procedural_generation is None:
                raise ValueError(
                    "HYBRID scenario requires static cards and procedural_generation"
                )
        if self.mode is not ScenarioMode.STATIC and self.schema_version < 3:
            raise ValueError("Procedural scenarios require schema_version 3")
        if self.schema_version < 2 and any(
            item.item_type is ScenarioItemType.INCOMING_CALL for item in self.cards
        ):
            raise ValueError("INCOMING_CALL items require scenario schema_version 2")
        keys = [card.key for card in self.cards]
        if len(keys) != len(set(keys)):
            raise ValueError("Scenario item keys must be unique")
        known = set(keys)
        if self.procedural_generation is not None:
            prefix = f"generated.{self.procedural_generation.key}."
            if any(key.startswith(prefix) for key in keys):
                raise ValueError(
                    "Static scenario item key conflicts with generated item keys"
                )
        for card in self.cards:
            if card.trigger_type is ScenarioTriggerType.AFTER_ACTION:
                dependency = card.trigger_config.card_key
                if dependency not in known:
                    raise ValueError(f"Unknown AFTER_ACTION card_key: {dependency}")
                if dependency == card.key:
                    raise ValueError("A scenario item cannot depend on itself")
        return self


class ResolvedScenarioItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    item_type: ScenarioItemType
    trigger_type: ScenarioTriggerType
    trigger_config: TimeOffsetTriggerConfig | AfterActionTriggerConfig
    source_type: Literal[ScenarioCardSourceType.SNAPSHOT]
    template_id: uuid.UUID | None = None
    template_key: uuid.UUID | None = None
    template_version: int | None = None
    initial_card: CardCreate | None = None
    initial_call: InitialIncomingCall | None = None
    expected_result: ExpectedResult
    assigned_operator_user_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_payload(self) -> "ResolvedScenarioItem":
        if self.item_type is ScenarioItemType.INCIDENT_CARD:
            if self.initial_card is None or self.initial_call is not None:
                raise ValueError("Resolved card item requires initial_card only")
        elif self.initial_call is None or self.initial_card is not None:
            raise ValueError("Resolved incoming call requires initial_call only")
        elif self.expected_result.card is None:
            raise ValueError("Resolved incoming call requires expected_result.card")
        return self


class ResolvedProceduralCardTemplate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_id: uuid.UUID
    template_key: uuid.UUID
    template_version: int = Field(ge=1)
    difficulty: int = Field(ge=1, le=4)
    initial_card: CardCreate
    expected_result: ExpectedResult


class ResolvedScenarioDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(ge=1)
    mode: ScenarioMode = ScenarioMode.STATIC
    cards: list[ResolvedScenarioItem] = Field(default_factory=list)
    procedural_generation: ProceduralCardGeneration | None = None
    procedural_catalog: list[ResolvedProceduralCardTemplate] = Field(
        default_factory=list
    )

    @model_validator(mode="after")
    def validate_resolved_definition(self) -> "ResolvedScenarioDefinition":
        if self.mode is ScenarioMode.STATIC:
            if not self.cards or self.procedural_generation is not None:
                raise ValueError("Resolved STATIC scenario requires static cards only")
            if self.procedural_catalog:
                raise ValueError("Resolved STATIC scenario must not contain a catalog")
        else:
            if self.procedural_generation is None:
                raise ValueError("Resolved procedural scenario requires generation config")
            if not self.procedural_catalog:
                raise ValueError("Resolved procedural scenario requires a template catalog")
            if self.mode is ScenarioMode.PROCEDURAL and self.cards:
                raise ValueError("Resolved PROCEDURAL scenario must not contain static cards")
            if self.mode is ScenarioMode.HYBRID and not self.cards:
                raise ValueError("Resolved HYBRID scenario requires static cards")
            if len(self.procedural_catalog) < self.procedural_generation.target_count:
                raise ValueError("Procedural catalog is smaller than target_count")
        return self


class ScenarioSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scenario_id: uuid.UUID
    scenario_revision: int = Field(ge=1)
    name: str
    description: str | None
    difficulty: int = Field(ge=1, le=4)
    estimated_duration_seconds: int = Field(gt=0)
    passing_score: Decimal = Field(ge=0, le=100, max_digits=5, decimal_places=2)
    workspace_mode: WorkspaceMode
    completion_policy: ScenarioCompletionPolicy
    min_participants: int = Field(ge=1)
    max_participants: int = Field(ge=1)
    required_participant_positions: list[str | None] | None = None
    definition: ResolvedScenarioDefinition


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
    difficulty: int = Field(default=1, ge=1, le=4)
    voice_id: str | None = Field(default=None, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*\.(?:wav|mp3)$")
    initial_card: CardCreate
    expected_result: ExpectedResult
    created_by: uuid.UUID | None = None

    @model_validator(mode="after")
    def require_final_card(self) -> "CardTemplateCreate":
        if self.expected_result.card is None:
            raise ValueError("Card template requires expected_result.card")
        return self


class CardTemplateResponse(OrmModel):
    id: uuid.UUID
    template_key: uuid.UUID
    version: int
    name: str
    description: str | None
    difficulty: int
    initial_card: dict[str, Any]
    expected_result: dict[str, Any]
    status: TemplateStatus
    generated_by_ai: bool
    ai_review_state: dict[str, str] | None
    generation_id: uuid.UUID | None
    is_active: bool
    created_by: uuid.UUID
    created_by_name: str | None = None
    created_at: datetime


class CardTemplateDeleteRequest(BaseModel):
    deleted_by: uuid.UUID | None = None


class CardTemplateUpdate(BaseModel):
    updated_by: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    difficulty: int | None = Field(default=None, ge=1, le=4)
    voice_id: str | None = Field(default=None, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*\.(?:wav|mp3)$")
    initial_card: CardCreate | None = None
    expected_result: ExpectedResult | None = None
    review_decisions: dict[
        str, Literal["CONFIRMED", "EDITED", "REJECTED"]
    ] = Field(default_factory=dict)
    status: Literal[TemplateStatus.PUBLISHED] | None = None

    @model_validator(mode="after")
    def require_final_card(self) -> "CardTemplateUpdate":
        if self.expected_result is not None and self.expected_result.card is None:
            raise ValueError("Card template requires expected_result.card")
        return self


class IncomingCallTemplateCreate(BaseModel):
    template_key: uuid.UUID | None = None
    version: int = Field(default=1, ge=1)
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    difficulty: int = Field(default=1, ge=1, le=4)
    voice_id: str | None = Field(default=None, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*\.(?:wav|mp3)$")
    initial_call: InitialIncomingCall
    expected_result: ExpectedResult
    created_by: uuid.UUID | None = None

    @model_validator(mode="after")
    def require_final_card(self) -> "IncomingCallTemplateCreate":
        if self.expected_result.card is None:
            raise ValueError("Incoming call template requires expected_result.card")
        if self.expected_result.outbound_call is not None:
            raise ValueError("Incoming call template cannot require an outbound call")
        if self.expected_result.service_status_history is not None:
            raise ValueError("Incoming call template cannot require DDS service status history")
        return self


class IncomingCallTemplateResponse(OrmModel):
    id: uuid.UUID
    template_key: uuid.UUID
    version: int
    name: str
    description: str | None
    difficulty: int
    initial_call: dict[str, Any]
    expected_result: dict[str, Any]
    status: TemplateStatus
    generated_by_ai: bool
    ai_review_state: dict[str, str] | None
    generation_id: uuid.UUID | None
    is_active: bool
    created_by: uuid.UUID
    created_by_name: str | None = None
    created_at: datetime


class IncomingCallTemplateDeleteRequest(BaseModel):
    deleted_by: uuid.UUID | None = None


class IncomingCallTemplateUpdate(BaseModel):
    updated_by: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    difficulty: int | None = Field(default=None, ge=1, le=4)
    voice_id: str | None = Field(default=None, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*\.(?:wav|mp3)$")
    initial_call: InitialIncomingCall | None = None
    expected_result: ExpectedResult | None = None
    review_decisions: dict[
        str, Literal["CONFIRMED", "EDITED", "REJECTED"]
    ] = Field(default_factory=dict)
    status: Literal[TemplateStatus.PUBLISHED] | None = None

    @model_validator(mode="after")
    def require_compatible_result(self) -> "IncomingCallTemplateUpdate":
        if self.expected_result is None:
            return self
        if self.expected_result.card is None:
            raise ValueError("Incoming call template requires expected_result.card")
        if self.expected_result.outbound_call is not None:
            raise ValueError("Incoming call template cannot require an outbound call")
        if self.expected_result.service_status_history is not None:
            raise ValueError("Incoming call template cannot require DDS service status history")
        return self


class CardTemplateGenerationCreate(BaseModel):
    dds_service_codes: list[Literal["101", "102", "103", "104"]] = Field(
        min_length=1, max_length=4
    )
    created_by: uuid.UUID | None = None

    @field_validator("dds_service_codes")
    @classmethod
    def require_unique_services(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("dds_service_codes must be unique")
        return value


class CardTemplateGenerationResponse(OrmModel):
    id: uuid.UUID
    dds_service_codes: list[str]
    status: TemplateGenerationStatus
    attempts: int
    last_error: str | None
    incoming_call_template_id: uuid.UUID | None
    card_template_ids: list[uuid.UUID]
    created_by: uuid.UUID
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None


class TrainingScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    difficulty: int = Field(ge=1, le=4)
    estimated_duration_seconds: int = Field(gt=0)
    passing_score: Decimal = Field(
        default=Decimal("100"), ge=0, le=100, max_digits=5, decimal_places=2
    )
    workspace_mode: WorkspaceMode = WorkspaceMode.INDIVIDUAL
    completion_policy: ScenarioCompletionPolicy | None = None
    min_participants: int = Field(default=1, ge=1, le=100)
    max_participants: int = Field(default=1, ge=1, le=100)
    required_participant_positions: list[str | None] | None = Field(
        default=None, min_length=1, max_length=100
    )
    definition: ScenarioDefinition
    status: ScenarioStatus = ScenarioStatus.DRAFT
    created_by: uuid.UUID | None = None

    @field_validator("required_participant_positions")
    @classmethod
    def normalize_required_positions(
        cls, value: list[str | None] | None
    ) -> list[str | None] | None:
        if value is None:
            return None
        normalized = [item.strip() if item is not None else None for item in value]
        if any(item == "" for item in normalized):
            raise ValueError("required participant position_code must not be blank")
        if len(normalized) != len(set(normalized)):
            raise ValueError("required participant positions must be unique")
        return normalized

    @model_validator(mode="after")
    def validate_participants(self) -> "TrainingScenarioCreate":
        if self.max_participants < self.min_participants:
            raise ValueError("max_participants must be greater than or equal to min_participants")
        if self.workspace_mode is WorkspaceMode.INDIVIDUAL and (
            self.min_participants != 1 or self.max_participants != 1
        ):
            raise ValueError("INDIVIDUAL scenario requires exactly one participant")
        if self.required_participant_positions is not None:
            required_count = len(self.required_participant_positions)
            if self.workspace_mode is WorkspaceMode.INDIVIDUAL and required_count != 1:
                raise ValueError("INDIVIDUAL scenario requires exactly one position")
            if required_count > self.min_participants:
                raise ValueError(
                    "min_participants must cover every required participant position"
                )
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
    updated_by: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    difficulty: int | None = Field(default=None, ge=1, le=4)
    estimated_duration_seconds: int | None = Field(default=None, gt=0)
    passing_score: Decimal | None = Field(
        default=None, ge=0, le=100, max_digits=5, decimal_places=2
    )
    workspace_mode: WorkspaceMode | None = None
    completion_policy: ScenarioCompletionPolicy | None = None
    min_participants: int | None = Field(default=None, ge=1, le=100)
    max_participants: int | None = Field(default=None, ge=1, le=100)
    required_participant_positions: list[str | None] | None = Field(
        default=None, min_length=1, max_length=100
    )
    definition: ScenarioDefinition | None = None
    status: ScenarioStatus | None = None

    @field_validator("required_participant_positions")
    @classmethod
    def normalize_required_positions(
        cls, value: list[str | None] | None
    ) -> list[str | None] | None:
        if value is None:
            return None
        normalized = [item.strip() if item is not None else None for item in value]
        if any(item == "" for item in normalized):
            raise ValueError("required participant position_code must not be blank")
        if len(normalized) != len(set(normalized)):
            raise ValueError("required participant positions must be unique")
        return normalized

    @model_validator(mode="after")
    def reject_null_passing_score(self) -> "TrainingScenarioUpdate":
        if "passing_score" in self.model_fields_set and self.passing_score is None:
            raise ValueError("passing_score cannot be null")
        return self


class ScenarioDeleteRequest(BaseModel):
    deleted_by: uuid.UUID | None = None
    expected_revision: int = Field(ge=1)


class TrainingScenarioResponse(OrmModel):
    id: uuid.UUID
    name: str
    description: str | None
    difficulty: int
    estimated_duration_seconds: int
    passing_score: Decimal
    cards_count: int
    workspace_mode: str
    completion_policy: str
    min_participants: int
    max_participants: int
    required_participant_positions: list[str | None] | None
    definition: dict[str, Any]
    revision: int
    status: str
    created_by: uuid.UUID
    created_by_name: str | None = None
    updated_by: uuid.UUID
    created_at: datetime
    updated_at: datetime

    @field_validator("definition", mode="before")
    @classmethod
    def hide_runtime_card_fields(cls, value: dict[str, Any]) -> dict[str, Any]:
        return strip_scenario_card_runtime_fields(value)


class ScenarioServiceDetail(BaseModel):
    service_id: uuid.UUID | None
    code: str
    name: str | None
    is_main: bool


class ScenarioItemDetail(BaseModel):
    key: str
    item_type: str
    source_type: str
    template_id: uuid.UUID | None = None
    template_name: str | None = None
    initial_card: dict[str, Any] | None = None
    expected_card: dict[str, Any] | None = None
    classification: OperatorClassification | None = None
    main_service: ScenarioServiceDetail | None = None
    notification_list: list[ScenarioServiceDetail] = Field(default_factory=list)


class TrainingScenarioDetailResponse(TrainingScenarioResponse):
    items: list[ScenarioItemDetail] = Field(default_factory=list)


class ScenarioRevisionTarget(BaseModel):
    scenario_id: uuid.UUID
    expected_revision: int = Field(ge=1)


class TemplateScenarioUpgradeRequest(BaseModel):
    updated_by: uuid.UUID | None = None
    scenarios: list[ScenarioRevisionTarget] = Field(min_length=1, max_length=100)

    @field_validator("scenarios")
    @classmethod
    def validate_unique_scenarios(
        cls, value: list[ScenarioRevisionTarget]
    ) -> list[ScenarioRevisionTarget]:
        scenario_ids = [item.scenario_id for item in value]
        if len(scenario_ids) != len(set(scenario_ids)):
            raise ValueError("scenarios must contain unique scenario_id values")
        return value


class ScenarioAssignmentCreate(BaseModel):
    scenario_id: uuid.UUID
    participant_ids: list[uuid.UUID] = Field(min_length=1, max_length=100)
    participant_positions: dict[uuid.UUID, str | None] = Field(default_factory=dict)
    incoming_call_operators: dict[str, uuid.UUID] = Field(default_factory=dict)
    assigned_by: uuid.UUID | None = None
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
        if any(code is not None and not code.strip() for code in self.participant_positions.values()):
            raise ValueError("participant position_code must not be blank")
        self.participant_positions = {
            user_id: code.strip() if code is not None else None
            for user_id, code in self.participant_positions.items()
        }
        dds_positions = [
            code for code in self.participant_positions.values() if code is not None
        ]
        if len(dds_positions) != len(set(dds_positions)):
            raise ValueError("Only one participant may occupy each DDS position")
        if self.available_from and self.due_at and self.due_at <= self.available_from:
            raise ValueError("due_at must be later than available_from")
        return self


class ScenarioAssignmentScheduleUpdate(BaseModel):
    available_from: datetime | None = None
    due_at: datetime | None = None

    @model_validator(mode="after")
    def validate_schedule(self) -> "ScenarioAssignmentScheduleUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one schedule field is required")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Schedule fields cannot be null")
        return self


class AssignmentParticipantResponse(OrmModel):
    user_id: uuid.UUID
    status: str
    position_code: str | None
    participant_role: ParticipantRole
    ready_at: datetime | None
    completed_at: datetime | None


class ScenarioAssignmentResponse(OrmModel):
    id: uuid.UUID
    scenario_id: uuid.UUID
    scenario_name: str
    scenario_revision: int
    passing_score: Decimal
    assignment_batch_id: uuid.UUID | None = None
    group_id: uuid.UUID | None = None
    group_name: str | None = None
    assigned_by: uuid.UUID
    workspace_mode: str
    launch_policy: str
    max_attempts: int
    status: str
    available_from: datetime | None
    due_at: datetime | None
    created_at: datetime
    participants: list[AssignmentParticipantResponse] = Field(default_factory=list)


class StudentAssignedScenarioMetadata(BaseModel):
    id: uuid.UUID
    revision: int
    name: str
    description: str | None = None
    difficulty: int
    estimated_duration_seconds: int
    passing_score: Decimal
    cards_count: int
    workspace_mode: str
    completion_policy: str


class StudentActiveSessionContext(BaseModel):
    session_id: uuid.UUID
    workspace_id: uuid.UUID
    attempt_number: int
    status: str
    started_at: datetime


class StudentScenarioAssignmentResponse(BaseModel):
    id: uuid.UUID
    scenario: StudentAssignedScenarioMetadata
    assigned_by: uuid.UUID
    launch_policy: str
    max_attempts: int
    attempts_used: int
    status: str
    available_from: datetime | None
    due_at: datetime | None
    created_at: datetime
    participant: AssignmentParticipantResponse
    active_session: StudentActiveSessionContext | None = None


class StartAssignmentRequest(BaseModel):
    user_id: uuid.UUID | None = None


class ReadyAssignmentRequest(BaseModel):
    user_id: uuid.UUID | None = None


class StartAssignmentResponse(BaseModel):
    session_id: uuid.UUID
    workspace_id: uuid.UUID
    assignment_id: uuid.UUID
    attempt_number: int
    status: str
    started_at: datetime
    idempotent_replay: bool = False


class SessionCompleteRequest(BaseModel):
    user_id: uuid.UUID | None = None


class SessionAbortRequest(BaseModel):
    teacher_id: uuid.UUID | None = None
    reason: str = Field(min_length=1, max_length=2000)


class IndividualSessionAbortRequest(BaseModel):
    user_id: uuid.UUID | None = None


class TrainingDiscrepancy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path: str
    expected: JsonValue
    actual: JsonValue
    reason: str

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        known = {
            "value_mismatch",
            "required_action_missing",  # Historical session results remain readable.
            "semantic_similarity_below_threshold",
            "semantic_evaluation_failed",
            "semantic_evaluation_missing",
            "card_not_opened",
            "card_open_deadline_missed",
            "card_decision_missing",
            "card_decision_deadline_missed",
        }
        if value not in known and not value.startswith("invalid_semantic_evaluation_rule: "):
            raise ValueError("Unknown discrepancy reason")
        return value


class TrainingCardOutcome(BaseModel):
    scenario_card_key: str
    incident_card_id: uuid.UUID
    score: Decimal
    passed: bool
    discrepancies: list[TrainingDiscrepancy]


class TrainingCallOutcome(BaseModel):
    scenario_item_key: str
    training_call_id: uuid.UUID
    incident_card_id: uuid.UUID
    score: Decimal
    passed: bool
    discrepancies: list[TrainingDiscrepancy]


class TrainingSessionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    passing_score: Decimal | None = Field(
        default=None, ge=0, le=100, max_digits=5, decimal_places=2
    )
    cards: list[TrainingCardOutcome] = Field(default_factory=list)
    incoming_calls: list[TrainingCallOutcome] = Field(default_factory=list)
    abort_reason: str | None = None


class EmptyCompletionState(BaseModel):
    """A session not yet examined by the readiness calculator."""

    model_config = ConfigDict(extra="forbid")


class TrainingSessionResponse(OrmModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    attempt_number: int
    status: str
    completion_policy: str
    completion_state: SessionCompletionReadinessResponse | EmptyCompletionState
    completion_state_revision: int
    ready_to_complete_at: datetime | None
    completed_automatically: bool
    started_at: datetime
    completed_at: datetime | None
    score: Decimal | None
    passed: bool | None
    result: TrainingSessionResult
    expert_score: Decimal | None
    expert_passed: bool | None
    expert_comment: str | None
    expert_evaluated_by: uuid.UUID | None
    expert_evaluated_at: datetime | None


class TrainingSessionSummary(OrmModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    attempt_number: int
    status: str
    completion_policy: str
    started_at: datetime
    completed_at: datetime | None
    score: Decimal | None
    passed: bool | None
    expert_score: Decimal | None
    expert_passed: bool | None
    expert_evaluated_at: datetime | None
    final_score: Decimal | None = None
    final_passed: bool | None = None


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
    generation_status: str | None = None
    generated_cards: int = 0
    generation_target: int = 0
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
    teacher_id: uuid.UUID | None = None
    student_ids: list[uuid.UUID] = Field(default_factory=list, max_length=1000)

    @field_validator("student_ids")
    @classmethod
    def validate_unique_students(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) != len(set(value)):
            raise ValueError("student_ids must be unique")
        return value


class LearningGroupUpdate(BaseModel):
    actor_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None


class LearningGroupMembersUpdate(BaseModel):
    actor_id: uuid.UUID | None = None
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
    assigned_by: uuid.UUID | None = None
    participant_ids: list[uuid.UUID] | None = Field(default=None, min_length=1, max_length=100)
    participant_positions: dict[uuid.UUID, str | None] = Field(default_factory=dict)
    incoming_call_operators: dict[str, uuid.UUID] = Field(default_factory=dict)
    launch_policy: LaunchPolicy = LaunchPolicy.STUDENT_SELF_START
    max_attempts: int = Field(default=1, ge=1, le=100)
    available_from: datetime | None = None
    due_at: datetime | None = None

    @model_validator(mode="after")
    def validate_dates_and_positions(self) -> "GroupScenarioAssignmentCreate":
        if self.participant_ids is not None:
            if len(self.participant_ids) != len(set(self.participant_ids)):
                raise ValueError("participant_ids must be unique")
            if set(self.participant_positions) != set(self.participant_ids):
                raise ValueError("participant_positions must contain exactly participant_ids")
        if any(code is not None and not code.strip() for code in self.participant_positions.values()):
            raise ValueError("participant position_code must not be blank")
        self.participant_positions = {
            user_id: code.strip() if code is not None else None
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
    participant_ids: list[uuid.UUID] = Field(default_factory=list)
    assignments: list[ScenarioAssignmentResponse] = Field(default_factory=list)


class ExpertAssessmentUpdate(BaseModel):
    teacher_id: uuid.UUID | None = None
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
    ringing_at: datetime | None
    answered_at: datetime | None
    completed_at: datetime | None
    expected_result: dict[str, Any]
    current_state: dict[str, Any] | None
    automatic_result: dict[str, Any] | None


class ExpertReviewOutgoingCallResponse(BaseModel):
    id: uuid.UUID
    card_id: uuid.UUID | None
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    interlocutor_role: str


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


class ExpertReviewCallUtterance(BaseModel):
    id: uuid.UUID
    call_id: uuid.UUID
    speaker: str
    input_mode: Literal["VOICE", "GENERATED"]
    sequence_no: int
    created_at: datetime
    text: str


class ExpertReviewContextResponse(BaseModel):
    session: TrainingSessionResponse
    scenario_snapshot: dict[str, Any]
    participant_ids: list[uuid.UUID]
    cards: list[ExpertReviewCardResponse]
    incoming_calls: list[ExpertReviewCallResponse] = Field(default_factory=list)
    outgoing_calls: list[ExpertReviewOutgoingCallResponse] = Field(default_factory=list)
    call_utterances: list[ExpertReviewCallUtterance] = Field(default_factory=list)
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
    participant_role: ParticipantRole


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
    expert_score: Decimal | None
    expert_passed: bool | None
    final_score: Decimal | None
    final_passed: bool | None
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
    user_id: uuid.UUID | None = None


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
    generator_key: str | None
    generation_index: int | None
    source_template_id: uuid.UUID | None


class TrainingCallResponse(OrmModel):
    id: uuid.UUID
    training_session_id: uuid.UUID
    workspace_id: uuid.UUID
    scenario_item_key: str
    trigger_type: str
    trigger_config: dict[str, Any]
    call_payload: InitialIncomingCall
    direction: str
    operator_user_id: uuid.UUID | None
    assigned_operator_user_id: uuid.UUID | None
    interlocutor_role: str
    status: str
    incident_card_id: uuid.UUID | None
    scheduled_at: datetime | None
    ringing_at: datetime | None
    answered_at: datetime | None
    completed_at: datetime | None
    attempts: int
    last_error: str | None


class OutgoingCallResponse(OrmModel):
    id: uuid.UUID
    training_session_id: uuid.UUID
    workspace_id: uuid.UUID
    incident_card_id: uuid.UUID
    direction: Literal["OUTBOUND"]
    status: str
    operator_user_id: uuid.UUID
    answered_at: datetime
    completed_at: datetime | None


class CallTranscriptUtterance(BaseModel):
    id: uuid.UUID
    speaker: Literal["OPERATOR", "CALLER", "RESPONSE_LEAD"]
    input_mode: Literal["VOICE", "GENERATED"]
    sequence_no: int
    created_at: datetime
    text: str
    duration_ms: int | None = None
    audio_urls: list[str] = Field(default_factory=list)


class CallTranscriptResponse(BaseModel):
    call_id: uuid.UUID
    training_session_id: uuid.UUID
    answered_at: datetime | None
    completed_at: datetime | None
    utterances: list[CallTranscriptUtterance]


class TrainingCallActionRequest(BaseModel):
    user_id: uuid.UUID | None = None


class TrainingCallCardLinkRequest(BaseModel):
    user_id: uuid.UUID | None = None
    incident_card_id: uuid.UUID
