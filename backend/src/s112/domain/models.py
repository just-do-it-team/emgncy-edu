from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from s112.common.enums import (
    AssignmentStatus,
    AudioMessageDirection,
    AudioMessageKind,
    AudioMessageStatus,
    CardStatus,
    LaunchPolicy,
    NotificationMethod,
    OutboxStatus,
    ParticipantRole,
    ParticipantStatus,
    ScenarioCardSourceType,
    ScenarioCompletionPolicy,
    ScenarioStatus,
    ScenarioTriggerType,
    ScheduledCardStatus,
    ServiceAddedReason,
    ServiceResponseStatus,
    SourceType,
    TrainingActionResult,
    TrainingCallStatus,
    TrainingSessionStatus,
    UserRole,
    WorkspaceMemberRole,
    WorkspaceMode,
    WorkspaceStatus,
)
from s112.domain.base import Base, TimestampMixin


JsonType = JSON().with_variant(JSONB(), "postgresql")
SYSTEM_WORKSPACE_ID = uuid.UUID("00000000-0000-0000-0000-000000000112")


class EventType(Base):
    """Top-level group: Rescue, 101, 102, 103, 104, Antiterror or EDDS."""

    __tablename__ = "event_type"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    event_kinds: Mapped[list[EventKind]] = relationship(back_populates="event_type")


class EventKind(Base):
    """Concrete type inside a group, for example Fire, ДТП or Allergy."""

    __tablename__ = "event_kind"
    __table_args__ = (
        UniqueConstraint("event_type_id", "code"),
        UniqueConstraint("id", "event_type_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_type_id: Mapped[int] = mapped_column(
        ForeignKey("event_type.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    event_type: Mapped[EventType] = relationship(back_populates="event_kinds")


class FirstOrderFeature(Base):
    __tablename__ = "first_order_feature"
    __table_args__ = (
        UniqueConstraint("event_kind_id", "code"),
        UniqueConstraint("id", "event_kind_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_kind_id: Mapped[int] = mapped_column(
        ForeignKey("event_kind.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class SecondOrderFeature(Base):
    __tablename__ = "second_order_feature"
    __table_args__ = (
        UniqueConstraint("first_order_feature_id", "code"),
        UniqueConstraint("id", "first_order_feature_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    first_order_feature_id: Mapped[int] = mapped_column(
        ForeignKey("first_order_feature.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ThirdOrderFeature(Base):
    __tablename__ = "third_order_feature"
    __table_args__ = (
        UniqueConstraint("second_order_feature_id", "code"),
        UniqueConstraint("id", "second_order_feature_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    second_order_feature_id: Mapped[int] = mapped_column(
        ForeignKey("second_order_feature.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class IncidentType(Base, TimestampMixin):
    """Final incident type calculated from the selected feature hierarchy."""

    __tablename__ = "incident_type"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    classifier_code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(1000), nullable=False)
    ekp_name: Mapped[str | None] = mapped_column(String(1000))
    statistics_group_name: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class SourceSystem(Base, TimestampMixin):
    __tablename__ = "source_system"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class EmergencyService(Base, TimestampMixin):
    __tablename__ = "emergency_service"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    notification_method: Mapped[str] = mapped_column(
        String(32), nullable=False, default=NotificationMethod.ARM_112.value
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class ServiceRoutingRule(Base, TimestampMixin):
    """A system rule that adds a service for an event kind."""

    __tablename__ = "service_routing_rule"
    __table_args__ = (
        UniqueConstraint(
            "event_kind_id", "service_id", "route_code",
            name="uq_service_routing_rule_kind_service_route",
        ),
        Index("ix_service_routing_rule_kind_active", "event_kind_id", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    event_kind_id: Mapped[int] = mapped_column(
        ForeignKey("event_kind.id", ondelete="CASCADE"),
        nullable=False,
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("emergency_service.id", ondelete="RESTRICT"),
        nullable=False,
    )
    route_code: Mapped[str] = mapped_column(String(100), nullable=False)
    condition: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)
    notification_method: Mapped[str] = mapped_column(
        String(32), nullable=False, default=NotificationMethod.INTEGRATION.value
    )
    external_incident_type: Mapped[str | None] = mapped_column(Text)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class IncidentCard(Base, TimestampMixin):
    __tablename__ = "incident_card"
    __table_args__ = (
        CheckConstraint("victims_count IS NULL OR victims_count >= 0", name="victims_nonnegative"),
        UniqueConstraint("id", "event_type_id"),
        UniqueConstraint(
            "workspace_id", "card_number", name="uq_incident_card_workspace_card_number"
        ),
        UniqueConstraint(
            "workspace_id",
            "source_system_id",
            "external_card_id",
            name="uq_incident_card_workspace_external_source",
        ),
        Index(
            "ix_incident_card_workspace_status_registered",
            "workspace_id",
            "current_status",
            "registered_at",
        ),
        Index(
            "ix_incident_card_workspace_event_registered",
            "workspace_id",
            "event_type_id",
            "registered_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("simulation_workspace.id", ondelete="RESTRICT"),
        nullable=False,
        default=lambda: SYSTEM_WORKSPACE_ID,
        server_default=str(SYSTEM_WORKSPACE_ID),
    )
    card_number: Mapped[str] = mapped_column(String(64), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default=SourceType.MANUAL.value)
    source_system_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("source_system.id", ondelete="RESTRICT")
    )
    external_card_id: Mapped[str | None] = mapped_column(String(255))
    parent_card_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("incident_card.id", ondelete="SET NULL")
    )
    event_type_id: Mapped[int] = mapped_column(
        ForeignKey("event_type.id", ondelete="RESTRICT"),
        nullable=False,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    questionnaire: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    reported_address: Mapped[str | None] = mapped_column(Text)
    incident_address: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    victims_count: Mapped[int | None] = mapped_column(Integer)
    operator_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    current_status: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default=CardStatus.REGISTERED.value,
    )
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    features: Mapped[CardFeature | None] = relationship(
        back_populates="card",
        cascade="all, delete-orphan",
        uselist=False,
    )
    services: Mapped[list[CardService]] = relationship(
        back_populates="card",
        primaryjoin="and_(IncidentCard.id == CardService.card_id, CardService.is_active.is_(True))",
    )


class CardFeature(Base):
    __tablename__ = "card_feature"
    __table_args__ = (
        ForeignKeyConstraint(
            ["card_id", "event_type_id"],
            ["incident_card.id", "incident_card.event_type_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["event_kind_id", "event_type_id"],
            ["event_kind.id", "event_kind.event_type_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["first_order_feature_id", "event_kind_id"],
            ["first_order_feature.id", "first_order_feature.event_kind_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["second_order_feature_id", "first_order_feature_id"],
            ["second_order_feature.id", "second_order_feature.first_order_feature_id"],
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["third_order_feature_id", "second_order_feature_id"],
            ["third_order_feature.id", "third_order_feature.second_order_feature_id"],
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "second_order_feature_id IS NULL OR first_order_feature_id IS NOT NULL",
            name="second_requires_first",
        ),
        CheckConstraint(
            "third_order_feature_id IS NULL OR second_order_feature_id IS NOT NULL",
            name="third_requires_second",
        ),
        Index(
            "ix_card_feature_classification",
            "event_type_id",
            "event_kind_id",
            "first_order_feature_id",
            "second_order_feature_id",
            "third_order_feature_id",
        ),
    )

    card_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    event_type_id: Mapped[int] = mapped_column(Integer, nullable=False)
    event_kind_id: Mapped[int] = mapped_column(Integer, nullable=False)
    first_order_feature_id: Mapped[int | None] = mapped_column(Integer)
    second_order_feature_id: Mapped[int | None] = mapped_column(Integer)
    third_order_feature_id: Mapped[int | None] = mapped_column(Integer)
    incident_type_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("incident_type.id", ondelete="RESTRICT")
    )
    additional_features: Mapped[dict[str, Any]] = mapped_column(
        JsonType,
        nullable=False,
        default=dict,
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    card: Mapped[IncidentCard] = relationship(back_populates="features")


class CardFeatureHistory(Base):
    __tablename__ = "card_feature_history"
    __table_args__ = (UniqueConstraint("card_id", "revision"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    card_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incident_card.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type_id: Mapped[int] = mapped_column(Integer, nullable=False)
    event_kind_id: Mapped[int] = mapped_column(Integer, nullable=False)
    first_order_feature_id: Mapped[int | None] = mapped_column(Integer)
    second_order_feature_id: Mapped[int | None] = mapped_column(Integer)
    third_order_feature_id: Mapped[int | None] = mapped_column(Integer)
    incident_type_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    additional_features: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class CardStatusHistory(Base):
    __tablename__ = "card_status_history"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    card_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incident_card.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status_code: Mapped[str] = mapped_column(String(40), nullable=False)
    set_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    cleared_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str | None] = mapped_column(Text)
    set_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)


class CardEventTypeHistory(Base):
    __tablename__ = "card_event_type_history"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    card_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incident_card.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type_id: Mapped[int] = mapped_column(
        ForeignKey("event_type.id", ondelete="RESTRICT"), nullable=False
    )
    changed_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    reason: Mapped[str | None] = mapped_column(Text)


class CardService(Base):
    __tablename__ = "card_service"
    __table_args__ = (
        UniqueConstraint("card_id", "service_id"),
        Index("ix_card_service_deadline", "current_status", "acceptance_deadline_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    card_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incident_card.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("emergency_service.id", ondelete="RESTRICT"),
        nullable=False,
    )
    added_reason: Mapped[str] = mapped_column(
        String(32), nullable=False, default=ServiceAddedReason.EKP.value
    )
    notification_method: Mapped[str] = mapped_column(
        String(32), nullable=False, default=NotificationMethod.INTEGRATION.value
    )
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    current_status: Mapped[str] = mapped_column(
        String(40), nullable=False, default=ServiceResponseStatus.ADDED.value
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acceptance_deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    open_deadline_missed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    decision_deadline_missed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    card: Mapped[IncidentCard] = relationship(back_populates="services")
    dispatches: Mapped[list[CardServiceDispatch]] = relationship(
        back_populates="card_service",
        cascade="all, delete-orphan",
    )


class CardServiceDispatch(Base):
    """Resolved delivery channel created from an automatic routing rule."""

    __tablename__ = "card_service_dispatch"
    __table_args__ = (UniqueConstraint("card_service_id", "route_code"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    card_service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("card_service.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    routing_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("service_routing_rule.id", ondelete="RESTRICT")
    )
    route_code: Mapped[str] = mapped_column(String(100), nullable=False)
    notification_method: Mapped[str] = mapped_column(String(32), nullable=False)
    external_incident_type: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    card_service: Mapped[CardService] = relationship(back_populates="dispatches")


class ServiceStatusHistory(Base):
    __tablename__ = "service_status_history"
    __table_args__ = (
        UniqueConstraint("source_system_id", "external_event_id"),
        Index("ix_service_status_card_service_time", "card_service_id", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    card_service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("card_service.id", ondelete="CASCADE"),
        nullable=False,
    )
    status_code: Mapped[str] = mapped_column(String(40), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    source_system_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("source_system.id", ondelete="RESTRICT")
    )
    comment: Mapped[str | None] = mapped_column(Text)
    external_event_id: Mapped[str | None] = mapped_column(String(255))


class CardListProjection(Base):
    __tablename__ = "card_list_projection"
    __table_args__ = (
        Index(
            "ix_card_projection_workspace_status_registered",
            "workspace_id",
            "current_status",
            "registered_at",
        ),
        Index(
            "ix_card_projection_workspace_event_registered",
            "workspace_id",
            "event_type_id",
            "registered_at",
        ),
        Index(
            "ix_card_projection_workspace_registered_card",
            "workspace_id",
            "registered_at",
            "card_id",
        ),
    )

    card_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("incident_card.id", ondelete="CASCADE"), primary_key=True
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("simulation_workspace.id", ondelete="CASCADE"), nullable=False
    )
    card_number: Mapped[str] = mapped_column(String(64), nullable=False)
    event_type_id: Mapped[int] = mapped_column(Integer, nullable=False)
    event_kind_id: Mapped[int | None] = mapped_column(Integer)
    incident_address: Mapped[str | None] = mapped_column(Text)
    victims_count: Mapped[int | None] = mapped_column(Integer)
    current_status: Mapped[str] = mapped_column(String(40), nullable=False)
    services_summary: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, nullable=False, default=list)
    features_summary: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)


class OutboxEvent(Base):
    __tablename__ = "outbox_event"
    __table_args__ = (
        UniqueConstraint("aggregate_type", "aggregate_id", "aggregate_version"),
        Index("ix_outbox_dispatch", "status", "available_at", "created_at"),
        Index("ix_outbox_aggregate_order", "aggregate_type", "aggregate_id", "aggregate_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    aggregate_type: Mapped[str] = mapped_column(String(100), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(64), nullable=False)
    aggregate_version: Mapped[int] = mapped_column(BigInteger, nullable=False)
    event_type: Mapped[str] = mapped_column(String(150), nullable=False)
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    message_key: Mapped[str] = mapped_column(String(255), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=OutboxStatus.PENDING.value
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    locked_by: Mapped[str | None] = mapped_column(String(255))
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserAccount(Base, TimestampMixin):
    __tablename__ = "user_account"
    __table_args__ = (
        CheckConstraint(
            "role IN ('ADMINISTRATOR', 'TEACHER', 'STUDENT')",
            name="role_allowed",
        ),
        Index("ix_user_account_role_blocked", "role", "is_blocked"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(64), nullable=False)
    normalized_username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320))
    normalized_email: Mapped[str | None] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(
        String(32), nullable=False, default=UserRole.STUDENT.value
    )
    is_blocked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)


class RevokedAccessToken(Base):
    __tablename__ = "revoked_access_token"

    token_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class LearningGroup(Base, TimestampMixin):
    __tablename__ = "learning_group"
    __table_args__ = (
        UniqueConstraint("teacher_id", "name", name="uq_learning_group_teacher_name"),
        Index("ix_learning_group_teacher_active", "teacher_id", "is_active"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class LearningGroupMember(Base):
    __tablename__ = "learning_group_member"
    __table_args__ = (
        Index("ix_learning_group_member_student_active", "student_id", "removed_at"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("learning_group.id", ondelete="CASCADE"), primary_key=True
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT"), primary_key=True
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditEvent(Base):
    __tablename__ = "audit_event"
    __table_args__ = (
        Index("ix_audit_event_occurred_at", "occurred_at"),
        Index("ix_audit_event_actor_time", "actor_id", "occurred_at"),
        Index("ix_audit_event_action_time", "action", "occurred_at"),
        Index("ix_audit_event_target", "target_type", "target_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    actor_username: Mapped[str | None] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    target_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_id: Mapped[str | None] = mapped_column(String(128))
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    request_id: Mapped[str | None] = mapped_column(String(128))


class SecurityPolicy(Base):
    __tablename__ = "security_policy"
    __table_args__ = (
        CheckConstraint("id = 1", name="singleton"),
        CheckConstraint(
            "password_min_length BETWEEN 8 AND 128",
            name="password_min_length_range",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    password_min_length: Mapped[int] = mapped_column(Integer, nullable=False, default=12)
    require_uppercase: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    require_lowercase: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    require_digit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    require_special: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)


class CardTemplate(Base):
    """Immutable version of a reusable training card."""

    __tablename__ = "card_template"
    __table_args__ = (
        UniqueConstraint("template_key", "version", name="uq_card_template_key_version"),
        CheckConstraint("version >= 1", name="version_positive"),
        CheckConstraint("difficulty BETWEEN 1 AND 5", name="difficulty_range"),
        Index("ix_card_template_active_name", "is_active", "name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    template_key: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, default=uuid.uuid4)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    initial_card: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    expected_result: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    evaluation_rules: Mapped[dict[str, Any]] = mapped_column(
        JsonType, nullable=False, default=dict
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class IncomingCallTemplate(Base):
    """Immutable version of a reusable simulated incoming call."""

    __tablename__ = "incoming_call_template"
    __table_args__ = (
        UniqueConstraint(
            "template_key", "version", name="uq_incoming_call_template_key_version"
        ),
        CheckConstraint("version >= 1", name="version_positive"),
        CheckConstraint("difficulty BETWEEN 1 AND 5", name="difficulty_range"),
        Index("ix_incoming_call_template_active_name", "is_active", "name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    template_key: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, default=uuid.uuid4)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    initial_call: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    expected_result: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TrainingScenario(Base, TimestampMixin):
    __tablename__ = "training_scenario"
    __table_args__ = (
        CheckConstraint("difficulty BETWEEN 1 AND 5", name="difficulty_range"),
        CheckConstraint("estimated_duration_seconds > 0", name="duration_positive"),
        CheckConstraint("cards_count >= 0", name="cards_count_nonnegative"),
        CheckConstraint("min_participants >= 1", name="min_participants_positive"),
        CheckConstraint(
            "max_participants >= min_participants", name="participant_range"
        ),
        CheckConstraint("revision >= 1", name="revision_positive"),
        CheckConstraint(
            "completion_policy IN ('STUDENT_CONFIRM', 'AUTO_WHEN_READY', 'TEACHER_ONLY')",
            name="completion_policy_valid",
        ),
        Index("ix_training_scenario_status_difficulty", "status", "difficulty"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False)
    estimated_duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    cards_count: Mapped[int] = mapped_column(Integer, nullable=False)
    workspace_mode: Mapped[str] = mapped_column(
        String(32), nullable=False, default=WorkspaceMode.INDIVIDUAL.value
    )
    completion_policy: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=ScenarioCompletionPolicy.STUDENT_CONFIRM.value,
    )
    min_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_participants: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    definition: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=ScenarioStatus.DRAFT.value
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT"), nullable=False
    )
    updated_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT"), nullable=False
    )


class AssignmentBatch(Base):
    __tablename__ = "assignment_batch"
    __table_args__ = (
        CheckConstraint("max_attempts >= 1", name="max_attempts_positive"),
        Index("ix_assignment_batch_group_created", "group_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("learning_group.id", ondelete="RESTRICT"), nullable=False
    )
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_scenario.id", ondelete="RESTRICT"), nullable=False
    )
    assigned_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT"), nullable=False
    )
    launch_policy: Mapped[str] = mapped_column(String(40), nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    available_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ScenarioAssignment(Base, TimestampMixin):
    __tablename__ = "scenario_assignment"
    __table_args__ = (
        CheckConstraint("scenario_revision >= 1", name="scenario_revision_positive"),
        CheckConstraint("max_attempts >= 1", name="max_attempts_positive"),
        Index("ix_scenario_assignment_status_due", "status", "due_at"),
        Index("ix_scenario_assignment_batch", "assignment_batch_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_scenario.id", ondelete="RESTRICT"), nullable=False
    )
    assignment_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("assignment_batch.id", ondelete="SET NULL")
    )
    scenario_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    scenario_snapshot: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    assigned_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT"), nullable=False
    )
    workspace_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    launch_policy: Mapped[str] = mapped_column(
        String(40), nullable=False, default=LaunchPolicy.STUDENT_SELF_START.value
    )
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=AssignmentStatus.ASSIGNED.value
    )
    available_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AssignmentParticipant(Base):
    __tablename__ = "assignment_participant"
    __table_args__ = (
        Index("ix_assignment_participant_user_status", "user_id", "status"),
        Index(
            "uq_assignment_participant_dds_position",
            "assignment_id",
            "position_code",
            unique=True,
            postgresql_where=text("position_code IS NOT NULL"),
            sqlite_where=text("position_code IS NOT NULL"),
        ),
        Index(
            "uq_assignment_participant_one_running_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'RUNNING'"),
            sqlite_where=text("status = 'RUNNING'"),
        ),
    )

    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scenario_assignment.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT"), primary_key=True
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=ParticipantStatus.ASSIGNED.value
    )
    position_code: Mapped[str | None] = mapped_column(String(100))

    @property
    def participant_role(self) -> str:
        return (
            ParticipantRole.DDS.value
            if self.position_code is not None
            else ParticipantRole.OPERATOR_112.value
        )
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TrainingSession(Base):
    __tablename__ = "training_session"
    __table_args__ = (
        UniqueConstraint(
            "assignment_id",
            "attempt_number",
            name="uq_training_session_assignment_attempt",
        ),
        UniqueConstraint(
            "assignment_id",
            "start_idempotency_key",
            name="uq_training_session_assignment_idempotency",
        ),
        CheckConstraint("attempt_number >= 1", name="attempt_number_positive"),
        CheckConstraint(
            "completion_policy IN ('STUDENT_CONFIRM', 'AUTO_WHEN_READY', 'TEACHER_ONLY')",
            name="completion_policy_valid",
        ),
        CheckConstraint(
            "completion_state_revision >= 0",
            name="completion_state_revision_nonnegative",
        ),
        CheckConstraint("score IS NULL OR (score >= 0 AND score <= 100)", name="score_range"),
        CheckConstraint(
            "expert_score IS NULL OR (expert_score >= 0 AND expert_score <= 100)",
            name="expert_score_range",
        ),
        Index("ix_training_session_assignment_status", "assignment_id", "status"),
        Index(
            "uq_training_session_one_active_assignment",
            "assignment_id",
            unique=True,
            postgresql_where=text("status IN ('CREATED', 'RUNNING')"),
            sqlite_where=text("status IN ('CREATED', 'RUNNING')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scenario_assignment.id", ondelete="RESTRICT"), nullable=False
    )
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    start_idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=TrainingSessionStatus.CREATED.value
    )
    completion_policy: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default=ScenarioCompletionPolicy.STUDENT_CONFIRM.value,
    )
    completion_state: Mapped[dict[str, Any]] = mapped_column(
        JsonType, nullable=False, default=dict
    )
    completion_state_revision: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    ready_to_complete_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    completed_automatically: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    passed: Mapped[bool | None] = mapped_column(Boolean)
    result: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)
    generation_state: Mapped[dict[str, Any]] = mapped_column(
        JsonType, nullable=False, default=dict
    )
    expert_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    expert_passed: Mapped[bool | None] = mapped_column(Boolean)
    expert_comment: Mapped[str | None] = mapped_column(Text)
    expert_evaluated_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT")
    )
    expert_evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SimulationWorkspace(Base):
    __tablename__ = "simulation_workspace"
    __table_args__ = (Index("ix_simulation_workspace_status", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    training_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("training_session.id", ondelete="CASCADE"), unique=True
    )
    mode: Mapped[str] = mapped_column(
        String(32), nullable=False, default=WorkspaceMode.INDIVIDUAL.value
    )
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=WorkspaceStatus.PREPARING.value
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WorkspaceMember(Base):
    __tablename__ = "workspace_member"
    __table_args__ = (Index("ix_workspace_member_user", "user_id", "left_at"),)

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("simulation_workspace.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT"), primary_key=True
    )
    member_role: Mapped[str] = mapped_column(
        String(32), nullable=False, default=WorkspaceMemberRole.PARTICIPANT.value
    )
    position_code: Mapped[str | None] = mapped_column(String(100))

    @property
    def participant_role(self) -> str:
        return (
            ParticipantRole.DDS.value
            if self.position_code is not None
            else ParticipantRole.OPERATOR_112.value
        )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SessionScheduledCard(Base):
    __tablename__ = "session_scheduled_card"
    __table_args__ = (
        UniqueConstraint(
            "training_session_id",
            "scenario_card_key",
            name="uq_session_scheduled_card_session_key",
        ),
        Index("ix_session_scheduled_card_due", "status", "scheduled_at"),
        Index("ix_session_scheduled_card_workspace", "workspace_id", "status"),
        UniqueConstraint(
            "training_session_id",
            "generator_key",
            "generation_index",
            name="uq_session_scheduled_card_generation",
        ),
        CheckConstraint(
            "(generator_key IS NULL AND generation_index IS NULL) OR "
            "(generator_key IS NOT NULL AND generation_index > 0)",
            name="generation_fields_valid",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    training_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_session.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("simulation_workspace.id", ondelete="CASCADE"), nullable=False
    )
    scenario_card_key: Mapped[str] = mapped_column(String(100), nullable=False)
    trigger_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default=ScenarioTriggerType.TIME_OFFSET.value
    )
    trigger_config: Mapped[dict[str, Any]] = mapped_column(
        JsonType, nullable=False, default=dict
    )
    source_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default=ScenarioCardSourceType.SNAPSHOT.value
    )
    card_payload: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    expected_result: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    evaluation_rules: Mapped[dict[str, Any]] = mapped_column(
        JsonType, nullable=False, default=dict
    )
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=ScheduledCardStatus.PENDING.value
    )
    incident_card_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("incident_card.id", ondelete="SET NULL"), unique=True
    )
    emitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    generator_key: Mapped[str | None] = mapped_column(String(100))
    generation_index: Mapped[int | None] = mapped_column(Integer)
    source_template_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("card_template.id", ondelete="RESTRICT")
    )


class TrainingCall(Base):
    """A simulated conversation within a training session."""

    __tablename__ = "training_call"
    __table_args__ = (
        UniqueConstraint(
            "training_session_id",
            "scenario_item_key",
            name="uq_training_call_session_item",
        ),
        CheckConstraint(
            "status IN ('PENDING', 'RINGING', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED')",
            name="status_valid",
        ),
        Index("ix_training_call_due", "status", "scheduled_at"),
        Index("ix_training_call_workspace", "workspace_id", "status"),
        CheckConstraint("direction IN ('INBOUND', 'OUTBOUND')", name="direction_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    training_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_session.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("simulation_workspace.id", ondelete="CASCADE"), nullable=False
    )
    scenario_item_key: Mapped[str] = mapped_column(String(100), nullable=False)
    trigger_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default=ScenarioTriggerType.TIME_OFFSET.value
    )
    trigger_config: Mapped[dict[str, Any]] = mapped_column(
        JsonType, nullable=False, default=dict
    )
    source_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default=ScenarioCardSourceType.SNAPSHOT.value
    )
    call_payload: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    direction: Mapped[str] = mapped_column(String(16), nullable=False, default="INBOUND")
    operator_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user_account.id", ondelete="RESTRICT"))
    assigned_operator_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT")
    )
    interlocutor_role: Mapped[str] = mapped_column(String(32), nullable=False, default="CALLER")
    expected_result: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=TrainingCallStatus.PENDING.value
    )
    incident_card_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("incident_card.id", ondelete="SET NULL"), unique=True
    )
    ringing_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)


class TrainingAction(Base):
    __tablename__ = "training_action"
    __table_args__ = (
        UniqueConstraint(
            "training_session_id", "request_id", name="uq_training_action_session_request"
        ),
        Index("ix_training_action_session_time", "training_session_id", "occurred_at"),
        Index("ix_training_action_card_time", "incident_card_id", "occurred_at"),
        Index("ix_training_action_actor_time", "actor_user_id", "occurred_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    training_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_session.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("simulation_workspace.id", ondelete="CASCADE"), nullable=False
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT")
    )
    incident_card_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("incident_card.id", ondelete="SET NULL")
    )
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(128))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    request_id: Mapped[str | None] = mapped_column(String(128))
    result: Mapped[str] = mapped_column(
        String(20), nullable=False, default=TrainingActionResult.SUCCESS.value
    )
    before_state: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    after_state: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    details: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)


class AudioMessage(Base):
    __tablename__ = "audio_message"
    __table_args__ = (
        UniqueConstraint(
            "training_session_id",
            "idempotency_key",
            name="uq_audio_message_session_idempotency",
        ),
        UniqueConstraint(
            "training_session_id",
            "sequence_no",
            name="uq_audio_message_session_sequence",
        ),
        UniqueConstraint("reply_to_message_id", name="uq_audio_message_reply_to"),
        CheckConstraint("sequence_no > 0", name="sequence_positive"),
        CheckConstraint("revision > 0", name="revision_positive"),
        CheckConstraint("speaker_role IN ('TRAINEE', 'CALLER', 'COMMANDER')", name="speaker_role_valid"),
        CheckConstraint(
            "kind IN ('STT', 'TTS')",
            name="kind_valid",
        ),
        CheckConstraint(
            "direction IN ('INBOUND', 'OUTBOUND')",
            name="direction_valid",
        ),
        CheckConstraint(
            "status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')",
            name="status_valid",
        ),
        CheckConstraint(
            "size_bytes IS NULL OR size_bytes >= 0",
            name="size_nonnegative",
        ),
        Index(
            "ix_audio_message_session_sequence",
            "training_session_id",
            "sequence_no",
        ),
        Index("ix_audio_message_card_sequence", "incident_card_id", "sequence_no"),
        Index("ix_audio_message_call_sequence", "training_call_id", "sequence_no"),
        Index("ix_audio_message_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    training_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("training_session.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("simulation_workspace.id", ondelete="CASCADE"), nullable=False
    )
    incident_card_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("incident_card.id", ondelete="SET NULL")
    )
    training_call_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("training_call.id", ondelete="CASCADE")
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user_account.id", ondelete="RESTRICT")
    )
    speaker_role: Mapped[str] = mapped_column(String(32), nullable=False, default="TRAINEE")
    reply_to_message_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("audio_message.id", ondelete="SET NULL"))
    generation_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    generation_status: Mapped[str | None] = mapped_column(String(20))
    final_segment_count: Mapped[int | None] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False, default=AudioMessageKind.STT.value
    )
    direction: Mapped[str] = mapped_column(
        String(16), nullable=False, default=AudioMessageDirection.INBOUND.value
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=AudioMessageStatus.QUEUED.value
    )
    sequence_no: Mapped[int] = mapped_column(BigInteger, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    source_text: Mapped[str | None] = mapped_column(Text)
    transcript: Mapped[str | None] = mapped_column(Text)
    object_key: Mapped[str | None] = mapped_column(String(1024))
    object_etag: Mapped[str | None] = mapped_column(String(255))
    sha256: Mapped[str | None] = mapped_column(String(64))
    content_type: Mapped[str | None] = mapped_column(String(128))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    sample_rate: Mapped[int | None] = mapped_column(Integer)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    client_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    processing_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    action_recorded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )


class TtsSegment(Base):
    __tablename__ = "tts_segment"
    __table_args__ = (
        UniqueConstraint("audio_message_id", "generation_id", "segment_no", name="uq_tts_segment_order"),
        CheckConstraint("segment_no > 0", name="segment_positive"),
        CheckConstraint("status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')", name="status_valid"),
        Index("ix_tts_segment_message_order", "audio_message_id", "segment_no"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    audio_message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("audio_message.id", ondelete="CASCADE"), nullable=False)
    generation_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    segment_no: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="QUEUED")
    object_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    sha256: Mapped[str | None] = mapped_column(String(64))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    sample_rate: Mapped[int | None] = mapped_column(Integer)
    content_type: Mapped[str | None] = mapped_column(String(128))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EventInbox(Base):
    __tablename__ = "event_inbox"
    __table_args__ = (Index("ix_event_inbox_processed_at", "processed_at"),)

    consumer_name: Mapped[str] = mapped_column(String(100), primary_key=True)
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TrainingCardResult(Base):
    __tablename__ = "training_card_result"
    __table_args__ = (
        CheckConstraint("score >= 0 AND score <= 100", name="score_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    session_scheduled_card_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("session_scheduled_card.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    discrepancies: Mapped[list[dict[str, Any]]] = mapped_column(
        JsonType, nullable=False, default=list
    )
    evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
