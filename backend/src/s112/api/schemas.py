from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from s112.common.enums import (
    CardStatus,
    NotificationMethod,
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


class FeatureOptionResponse(OrmModel):
    id: int
    code: str
    name: str
    sort_order: int


class FeatureOptionCreate(BaseModel):
    code: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=500)
    sort_order: int = 0


class ClassificationResolutionResponse(BaseModel):
    feature_schema_id: uuid.UUID
    incident_type_id: uuid.UUID | None
    incident_type_name: str | None
    ekp_name: str | None
    additional_features_schema: dict[str, Any]


class CardFeatureInput(BaseModel):
    event_kind_id: int
    first_order_feature_id: int | None = None
    second_order_feature_id: int | None = None
    third_order_feature_id: int | None = None
    feature_schema_id: uuid.UUID | None = None
    additional_features: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_hierarchy(self) -> "CardFeatureInput":
        if self.second_order_feature_id is not None and self.first_order_feature_id is None:
            raise ValueError("second_order_feature_id requires first_order_feature_id")
        if self.third_order_feature_id is not None and self.second_order_feature_id is None:
            raise ValueError("third_order_feature_id requires second_order_feature_id")
        return self


class CardCreate(BaseModel):
    workspace_id: uuid.UUID = SYSTEM_WORKSPACE_ID
    card_number: str | None = Field(default=None, max_length=64)
    source_type: SourceType = SourceType.MANUAL
    source_system_id: uuid.UUID | None = None
    external_card_id: str | None = Field(default=None, max_length=255)
    parent_card_id: uuid.UUID | None = None
    event_type_id: int
    description: str = ""
    questionnaire: dict[str, Any] | None = None
    reported_address: str | None = None
    incident_address: str | None = None
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    victims_count: int | None = Field(default=None, ge=0)
    operator_id: uuid.UUID | None = None
    request_id: str | None = Field(default=None, max_length=128)
    features: CardFeatureInput | None = None


class CardUpdate(BaseModel):
    expected_version: int = Field(ge=1)
    description: str | None = None
    questionnaire: dict[str, Any] | None = None
    reported_address: str | None = None
    incident_address: str | None = None
    victims_count: int | None = Field(default=None, ge=0)
    actor_id: uuid.UUID | None = None
    request_id: str | None = Field(default=None, max_length=128)


class CardFeatureUpdate(CardFeatureInput):
    expected_card_version: int = Field(ge=1)
    actor_id: uuid.UUID | None = None
    request_id: str | None = Field(default=None, max_length=128)


class CardFeatureResponse(OrmModel):
    event_type_id: int
    event_kind_id: int
    first_order_feature_id: int | None
    second_order_feature_id: int | None
    third_order_feature_id: int | None
    incident_type_id: uuid.UUID | None
    feature_schema_id: uuid.UUID | None
    additional_features: dict[str, Any]
    revision: int
    updated_by: uuid.UUID | None
    updated_at: datetime


class CardListItem(OrmModel):
    card_id: uuid.UUID
    workspace_id: uuid.UUID
    card_number: str
    event_type_id: int
    event_kind_id: int | None
    incident_address: str | None
    victims_count: int | None
    current_status: str
    services_summary: list[dict[str, Any]]
    features_summary: dict[str, Any]
    registered_at: datetime
    last_updated_at: datetime
    version: int


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
    first_order_feature_id: int | None
    second_order_feature_id: int | None
    third_order_feature_id: int | None
    incident_type_id: uuid.UUID | None
    feature_schema_id: uuid.UUID | None
    additional_features: dict[str, Any]
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
    actor_id: uuid.UUID | None = None
    request_id: str | None = Field(default=None, max_length=128)


class CardServiceResponse(OrmModel):
    id: uuid.UUID
    card_id: uuid.UUID
    service_id: uuid.UUID
    added_reason: str
    notification_method: str
    is_visible: bool
    is_active: bool
    current_status: str
    added_at: datetime
    sent_at: datetime | None
    acceptance_deadline_at: datetime | None
    received_at: datetime | None
    closed_at: datetime | None
    removed_at: datetime | None


class CardResponse(OrmModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    card_number: str
    source_type: str
    source_system_id: uuid.UUID | None
    external_card_id: str | None
    parent_card_id: uuid.UUID | None
    event_type_id: int
    description: str
    questionnaire: dict[str, Any] | None
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
