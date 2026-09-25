from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

from s112.common.enums import (
    CardStatus,
    NotificationMethod,
    ServiceAddedReason,
    ServiceResponseStatus,
    SourceType,
)
from s112.domain.models import SYSTEM_WORKSPACE_ID


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class EventTypeResponse(OrmModel):
    id: int
    code: str
    name: str


class EventKindResponse(OrmModel):
    id: int
    event_type_id: int
    code: str
    name: str


class AdditionalFeatureProperty(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["string", "boolean", "number", "integer"]
    title: str | None = None
    description: str | None = None
    enum: list[JsonValue] | None = None

    @model_validator(mode="after")
    def validate_enum(self) -> "AdditionalFeatureProperty":
        if self.enum is not None:
            if not self.enum:
                raise ValueError("enum must not be empty")
            if any(not self.accepts(value) for value in self.enum):
                raise ValueError("enum values must match property type")
        return self

    def accepts(self, value: JsonValue) -> bool:
        if self.type == "string":
            return isinstance(value, str)
        if self.type == "boolean":
            return isinstance(value, bool)
        if self.type == "integer":
            return isinstance(value, int) and not isinstance(value, bool)
        return isinstance(value, (int, float)) and not isinstance(value, bool)


class AdditionalFeaturesSchema(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    type: Literal["object"] = "object"
    properties: dict[str, AdditionalFeatureProperty] = Field(default_factory=dict)
    required: list[str] = Field(default_factory=list)
    additional_properties: bool = Field(default=True, alias="additionalProperties")

    @model_validator(mode="after")
    def validate_required(self) -> "AdditionalFeaturesSchema":
        if len(self.required) != len(set(self.required)) or set(self.required) - set(self.properties):
            raise ValueError("required must contain unique property names")
        if self.properties and self.additional_properties:
            raise ValueError("Configured properties require additionalProperties=false")
        return self

    def validate_values(self, values: dict[str, JsonValue]) -> None:
        unknown = set(values) - set(self.properties)
        if unknown and not self.additional_properties:
            raise ValueError(f"Unknown additional features: {', '.join(sorted(unknown))}")
        missing = set(self.required) - set(values)
        if missing:
            raise ValueError(f"Missing additional features: {', '.join(sorted(missing))}")
        for key, value in values.items():
            if key not in self.properties:
                continue
            prop = self.properties[key]
            if not prop.accepts(value) or (prop.enum is not None and value not in prop.enum):
                raise ValueError(f"Invalid additional feature: {key}")


class CardQuestionnaire(BaseModel):
    model_config = ConfigDict(extra="forbid")

    questions: str
    answers: str


class CardFeatureInput(BaseModel):
    event_kind_id: int
    additional_features: dict[str, JsonValue] = Field(default_factory=dict)


class OperatorClassification(BaseModel):
    model_config = ConfigDict(extra="forbid")

    record_id: int = Field(gt=0)
    group_code: int = Field(ge=0)
    feature_1_code: int = Field(ge=0)
    feature_2_code: int = Field(ge=0)
    feature_3_code: int = Field(ge=0)
    final_incident_type: str = Field(min_length=1)
    routing_flags: dict[str, bool] = Field(default_factory=dict)
    excluded_service_codes: list[str] = Field(default_factory=list)


class CardCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: uuid.UUID = SYSTEM_WORKSPACE_ID
    card_number: str | None = Field(default=None, max_length=64)
    source_type: SourceType = SourceType.MANUAL
    source_system_id: uuid.UUID | None = None
    external_card_id: str | None = Field(default=None, max_length=255)
    parent_card_id: uuid.UUID | None = None
    classification: OperatorClassification
    description: str = ""
    questionnaire: CardQuestionnaire | None = None
    applicant_full_name: str | None = Field(default=None, max_length=255)
    automatic_phone_number: str | None = Field(default=None, max_length=64)
    provided_phone_number: str | None = Field(default=None, max_length=64)
    location_phone_number: str | None = Field(default=None, max_length=64)
    reported_address: str | None = None
    incident_address: str | None = None
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    victims_count: int | None = Field(default=None, ge=0)
    operator_id: uuid.UUID | None = None
    request_id: str | None = Field(default=None, max_length=128)


class CardUpdate(BaseModel):
    expected_version: int = Field(ge=1)
    description: str | None = None
    questionnaire: CardQuestionnaire | None = None
    applicant_full_name: str | None = Field(default=None, max_length=255)
    automatic_phone_number: str | None = Field(default=None, max_length=64)
    provided_phone_number: str | None = Field(default=None, max_length=64)
    location_phone_number: str | None = Field(default=None, max_length=64)
    reported_address: str | None = None
    incident_address: str | None = None
    victims_count: int | None = Field(default=None, ge=0)
    classification: OperatorClassification | None = None
    actor_id: uuid.UUID | None = None
    request_id: str | None = Field(default=None, max_length=128)


class CardFeatureUpdate(CardFeatureInput):
    expected_card_version: int = Field(ge=1)
    actor_id: uuid.UUID | None = None
    request_id: str | None = Field(default=None, max_length=128)


class CardFeatureResponse(OrmModel):
    event_type_id: int
    event_kind_id: int
    additional_features: dict[str, JsonValue]
    revision: int
    updated_by: uuid.UUID | None
    updated_at: datetime


class CardServiceSummary(BaseModel):
    card_service_id: uuid.UUID
    service_id: uuid.UUID
    service_code: str
    added_reason: ServiceAddedReason | None = None
    status: ServiceResponseStatus


class CardFeaturesSummary(BaseModel):
    event_kind_id: int | None = None
    additional_features: dict[str, JsonValue] = Field(default_factory=dict)
    revision: int | None = None


class CardListItem(OrmModel):
    card_id: uuid.UUID
    workspace_id: uuid.UUID
    card_number: str
    event_type_id: int | None
    classification: OperatorClassification | None
    event_kind_id: int | None
    applicant_full_name: str | None
    incident_address: str | None
    victims_count: int | None
    current_status: str
    services_summary: list[CardServiceSummary]
    features_summary: CardFeaturesSummary
    registered_at: datetime
    last_updated_at: datetime
    version: int


class CardListPage(BaseModel):
    items: list[CardListItem]
    next_cursor: str | None = None


class CardStatusCreate(BaseModel):
    status: CardStatus
    expected_card_version: int = Field(ge=1)
    reason: str | None = None
    actor_id: uuid.UUID | None = None
    request_id: str | None = Field(default=None, max_length=128)


class CardStatusHistoryResponse(OrmModel):
    id: uuid.UUID
    card_id: uuid.UUID
    status_code: str
    set_at: datetime
    cleared_at: datetime | None
    reason: str | None
    set_by: uuid.UUID | None


class CardFeatureHistoryResponse(OrmModel):
    id: uuid.UUID
    card_id: uuid.UUID
    revision: int
    event_type_id: int
    event_kind_id: int
    additional_features: dict[str, JsonValue]
    changed_by: uuid.UUID | None
    changed_at: datetime


class EmergencyServiceCreate(BaseModel):
    code: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    notification_method: NotificationMethod = NotificationMethod.ARM_112
    sort_order: int = 0


class EmergencyServiceResponse(OrmModel):
    id: uuid.UUID
    code: str
    name: str
    notification_method: str
    sort_order: int
    is_active: bool


class CardServiceCreate(BaseModel):
    service_id: uuid.UUID
    expected_card_version: int = Field(ge=1)
    added_reason: Literal[
        ServiceAddedReason.MANUAL, ServiceAddedReason.CLASSIFIER
    ] = ServiceAddedReason.MANUAL
    actor_id: uuid.UUID | None = None
    request_id: str | None = Field(default=None, max_length=128)


class CardServiceResponse(OrmModel):
    id: uuid.UUID
    card_id: uuid.UUID
    service_id: uuid.UUID
    added_reason: ServiceAddedReason
    notification_method: str
    is_visible: bool
    is_active: bool
    current_status: str
    added_at: datetime
    sent_at: datetime | None
    acceptance_deadline_at: datetime | None
    received_at: datetime | None
    decision_deadline_at: datetime | None
    decided_at: datetime | None
    open_deadline_missed_at: datetime | None
    decision_deadline_missed_at: datetime | None
    closed_at: datetime | None
    removed_at: datetime | None


class CardDecisionRequest(BaseModel):
    decision: ServiceResponseStatus
    comment: str | None = None
    request_id: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def validate_decision(self) -> "CardDecisionRequest":
        if self.decision not in {
            ServiceResponseStatus.ACCEPTED,
            ServiceResponseStatus.REJECTED,
        }:
            raise ValueError("decision must be ACCEPTED or REJECTED")
        if self.decision is ServiceResponseStatus.REJECTED and (
            not self.comment or not self.comment.strip()
        ):
            raise ValueError("comment is required for REJECTED decision")
        return self


class CardResponse(OrmModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    card_number: str
    source_type: str
    source_system_id: uuid.UUID | None
    external_card_id: str | None
    parent_card_id: uuid.UUID | None
    event_type_id: int | None
    classification: OperatorClassification | None
    description: str
    questionnaire: CardQuestionnaire | None
    applicant_full_name: str | None
    automatic_phone_number: str | None
    provided_phone_number: str | None
    location_phone_number: str | None
    reported_address: str | None
    incident_address: str | None
    latitude: Decimal | None
    longitude: Decimal | None
    victims_count: int | None
    operator_id: uuid.UUID | None
    reviewer_id: uuid.UUID | None
    current_status: str
    registered_at: datetime
    processed_at: datetime | None
    checked_at: datetime | None
    closed_at: datetime | None
    version: int
    features: CardFeatureResponse | None = None
    services: list[CardServiceResponse] = Field(default_factory=list)


class ServiceStatusCreate(BaseModel):
    status: ServiceResponseStatus
    expected_card_version: int = Field(ge=1)
    occurred_at: datetime
    author_id: uuid.UUID | None = None
    source_system_id: uuid.UUID | None = None
    comment: str | None = None
    external_event_id: str | None = Field(default=None, max_length=255)
    request_id: str | None = Field(default=None, max_length=128)


class ServiceStatusResponse(OrmModel):
    id: uuid.UUID
    card_service_id: uuid.UUID
    status_code: str
    occurred_at: datetime
    recorded_at: datetime
    author_id: uuid.UUID | None
    source_system_id: uuid.UUID | None
    comment: str | None
    external_event_id: str | None


class HealthResponse(BaseModel):
    status: str
    service: str
