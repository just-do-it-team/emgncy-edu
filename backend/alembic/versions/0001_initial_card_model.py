"""Initial incident-card, classifier, read-model and outbox schema.

Revision ID: 0001
Revises: None
"""

import uuid
from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from s112.domain.classifier import CLASSIFIER


revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.create_table(
        "event_type",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("code", name="uq_event_type_code"),
    )
    op.create_table(
        "event_kind",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_type_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["event_type_id"], ["event_type.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("event_type_id", "code", name="uq_event_kind_event_type_code"),
        sa.UniqueConstraint("id", "event_type_id", name="uq_event_kind_id_event_type"),
    )
    op.create_index("ix_event_kind_event_type_id", "event_kind", ["event_type_id"])

    op.create_table(
        "first_order_feature",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_kind_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(["event_kind_id"], ["event_kind.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("event_kind_id", "code", name="uq_first_order_feature_kind_code"),
        sa.UniqueConstraint("id", "event_kind_id", name="uq_first_order_feature_id_kind"),
    )
    op.create_index(
        "ix_first_order_feature_event_kind_id", "first_order_feature", ["event_kind_id"]
    )
    op.create_table(
        "second_order_feature",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("first_order_feature_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(
            ["first_order_feature_id"], ["first_order_feature.id"], ondelete="RESTRICT"
        ),
        sa.UniqueConstraint(
            "first_order_feature_id", "code", name="uq_second_order_feature_first_code"
        ),
        sa.UniqueConstraint(
            "id", "first_order_feature_id", name="uq_second_order_feature_id_first"
        ),
    )
    op.create_index(
        "ix_second_order_feature_first_order_feature_id",
        "second_order_feature",
        ["first_order_feature_id"],
    )
    op.create_table(
        "third_order_feature",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("second_order_feature_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(
            ["second_order_feature_id"], ["second_order_feature.id"], ondelete="RESTRICT"
        ),
        sa.UniqueConstraint(
            "second_order_feature_id", "code", name="uq_third_order_feature_second_code"
        ),
        sa.UniqueConstraint(
            "id", "second_order_feature_id", name="uq_third_order_feature_id_second"
        ),
    )
    op.create_index(
        "ix_third_order_feature_second_order_feature_id",
        "third_order_feature",
        ["second_order_feature_id"],
    )
    op.create_table(
        "incident_type",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("classifier_code", sa.String(64), nullable=False),
        sa.Column("name", sa.String(1000), nullable=False),
        sa.Column("ekp_name", sa.String(1000)),
        sa.Column("statistics_group_name", sa.String(500)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("classifier_code", name="uq_incident_type_classifier_code"),
    )

    op.create_table(
        "feature_schema",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("event_kind_id", sa.Integer(), nullable=False),
        sa.Column("first_order_feature_id", sa.Integer()),
        sa.Column("second_order_feature_id", sa.Integer()),
        sa.Column("third_order_feature_id", sa.Integer()),
        sa.Column("incident_type_id", UUID),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("json_schema", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["event_kind_id"], ["event_kind.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["first_order_feature_id"], ["first_order_feature.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["second_order_feature_id"], ["second_order_feature.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["third_order_feature_id"], ["third_order_feature.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["incident_type_id"], ["incident_type.id"], ondelete="RESTRICT"
        ),
        sa.UniqueConstraint(
            "event_kind_id",
            "first_order_feature_id",
            "second_order_feature_id",
            "third_order_feature_id",
            "version",
            name="uq_feature_schema_hierarchy_version",
        ),
    )

    op.create_table(
        "source_system",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("code", name="uq_source_system_code"),
    )
    op.create_table(
        "emergency_service",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("code", sa.String(100), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("notification_method", sa.String(32), nullable=False, server_default="ARM_112"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("code", name="uq_emergency_service_code"),
    )
    op.create_table(
        "service_routing_rule",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("feature_schema_id", UUID, nullable=False),
        sa.Column("service_id", UUID, nullable=False),
        sa.Column("route_code", sa.String(100), nullable=False),
        sa.Column("condition", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("notification_method", sa.String(32), nullable=False, server_default="INTEGRATION"),
        sa.Column("external_incident_type", sa.Text()),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(
            ["feature_schema_id"], ["feature_schema.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["service_id"], ["emergency_service.id"], ondelete="RESTRICT"
        ),
        sa.UniqueConstraint(
            "feature_schema_id",
            "service_id",
            "route_code",
            name="uq_service_routing_rule_schema_service_route",
        ),
    )
    op.create_index(
        "ix_service_routing_rule_schema_active",
        "service_routing_rule",
        ["feature_schema_id", "is_active"],
    )

    op.create_table(
        "incident_card",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("card_number", sa.String(64), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False, server_default="MANUAL"),
        sa.Column("source_system_id", UUID),
        sa.Column("external_card_id", sa.String(255)),
        sa.Column("parent_card_id", UUID),
        sa.Column("event_type_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("questionnaire", JSONB),
        sa.Column("reported_address", sa.Text()),
        sa.Column("incident_address", sa.Text()),
        sa.Column("latitude", sa.Numeric(9, 6)),
        sa.Column("longitude", sa.Numeric(9, 6)),
        sa.Column("victims_count", sa.Integer()),
        sa.Column("operator_id", UUID),
        sa.Column("reviewer_id", UUID),
        sa.Column("current_status", sa.String(40), nullable=False, server_default="REGISTERED"),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("checked_at", sa.DateTime(timezone=True)),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "victims_count IS NULL OR victims_count >= 0", name="ck_incident_card_victims_nonnegative"
        ),
        sa.ForeignKeyConstraint(["source_system_id"], ["source_system.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["parent_card_id"], ["incident_card.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["event_type_id"], ["event_type.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("card_number", name="uq_incident_card_card_number"),
        sa.UniqueConstraint("id", "event_type_id", name="uq_incident_card_id_event_type"),
        sa.UniqueConstraint(
            "source_system_id", "external_card_id", name="uq_incident_card_external_source"
        ),
    )
    op.create_index(
        "ix_incident_card_status_registered", "incident_card", ["current_status", "registered_at"]
    )
    op.create_index(
        "ix_incident_card_event_registered", "incident_card", ["event_type_id", "registered_at"]
    )

    op.create_table(
        "card_feature",
        sa.Column("card_id", UUID, primary_key=True),
        sa.Column("event_type_id", sa.Integer(), nullable=False),
        sa.Column("event_kind_id", sa.Integer(), nullable=False),
        sa.Column("first_order_feature_id", sa.Integer()),
        sa.Column("second_order_feature_id", sa.Integer()),
        sa.Column("third_order_feature_id", sa.Integer()),
        sa.Column("incident_type_id", UUID),
        sa.Column("feature_schema_id", UUID),
        sa.Column("additional_features", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_by", UUID),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "second_order_feature_id IS NULL OR first_order_feature_id IS NOT NULL",
            name="ck_card_feature_second_requires_first",
        ),
        sa.CheckConstraint(
            "third_order_feature_id IS NULL OR second_order_feature_id IS NOT NULL",
            name="ck_card_feature_third_requires_second",
        ),
        sa.ForeignKeyConstraint(
            ["card_id", "event_type_id"],
            ["incident_card.id", "incident_card.event_type_id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["event_kind_id", "event_type_id"],
            ["event_kind.id", "event_kind.event_type_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["first_order_feature_id", "event_kind_id"],
            ["first_order_feature.id", "first_order_feature.event_kind_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["second_order_feature_id", "first_order_feature_id"],
            ["second_order_feature.id", "second_order_feature.first_order_feature_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["third_order_feature_id", "second_order_feature_id"],
            ["third_order_feature.id", "third_order_feature.second_order_feature_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["incident_type_id"], ["incident_type.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(["feature_schema_id"], ["feature_schema.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_card_feature_classification",
        "card_feature",
        [
            "event_type_id",
            "event_kind_id",
            "first_order_feature_id",
            "second_order_feature_id",
            "third_order_feature_id",
        ],
    )

    op.create_table(
        "card_feature_history",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("card_id", UUID, nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("event_type_id", sa.Integer(), nullable=False),
        sa.Column("event_kind_id", sa.Integer(), nullable=False),
        sa.Column("first_order_feature_id", sa.Integer()),
        sa.Column("second_order_feature_id", sa.Integer()),
        sa.Column("third_order_feature_id", sa.Integer()),
        sa.Column("incident_type_id", UUID),
        sa.Column("feature_schema_id", UUID),
        sa.Column("additional_features", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("changed_by", UUID),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["card_id"], ["incident_card.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("card_id", "revision", name="uq_card_feature_history_revision"),
    )
    op.create_index("ix_card_feature_history_card_id", "card_feature_history", ["card_id"])

    op.create_table(
        "card_status_history",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("card_id", UUID, nullable=False),
        sa.Column("status_code", sa.String(40), nullable=False),
        sa.Column("set_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("cleared_at", sa.DateTime(timezone=True)),
        sa.Column("reason", sa.Text()),
        sa.Column("set_by", UUID),
        sa.ForeignKeyConstraint(["card_id"], ["incident_card.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_card_status_history_card_id", "card_status_history", ["card_id"])

    op.create_table(
        "card_event_type_history",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("card_id", UUID, nullable=False),
        sa.Column("event_type_id", sa.Integer(), nullable=False),
        sa.Column("changed_by", UUID),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("reason", sa.Text()),
        sa.ForeignKeyConstraint(["card_id"], ["incident_card.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_type_id"], ["event_type.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_card_event_type_history_card_id", "card_event_type_history", ["card_id"])

    op.create_table(
        "card_service",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("card_id", UUID, nullable=False),
        sa.Column("service_id", UUID, nullable=False),
        sa.Column("added_reason", sa.String(32), nullable=False, server_default="EKP"),
        sa.Column("notification_method", sa.String(32), nullable=False, server_default="INTEGRATION"),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("current_status", sa.String(40), nullable=False, server_default="ADDED"),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("acceptance_deadline_at", sa.DateTime(timezone=True)),
        sa.Column("received_at", sa.DateTime(timezone=True)),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.Column("removed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["card_id"], ["incident_card.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_id"], ["emergency_service.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("card_id", "service_id", name="uq_card_service_card_service"),
    )
    op.create_index("ix_card_service_card_id", "card_service", ["card_id"])
    op.create_index(
        "ix_card_service_deadline", "card_service", ["current_status", "acceptance_deadline_at"]
    )
    op.create_table(
        "card_service_dispatch",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("card_service_id", UUID, nullable=False),
        sa.Column("routing_rule_id", UUID),
        sa.Column("route_code", sa.String(100), nullable=False),
        sa.Column("notification_method", sa.String(32), nullable=False),
        sa.Column("external_incident_type", sa.Text()),
        sa.Column("payload", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.ForeignKeyConstraint(
            ["card_service_id"], ["card_service.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["routing_rule_id"], ["service_routing_rule.id"], ondelete="RESTRICT"
        ),
        sa.UniqueConstraint(
            "card_service_id", "route_code", name="uq_card_service_dispatch_service_route"
        ),
    )
    op.create_index(
        "ix_card_service_dispatch_card_service_id",
        "card_service_dispatch",
        ["card_service_id"],
    )

    op.create_table(
        "service_status_history",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("card_service_id", UUID, nullable=False),
        sa.Column("status_code", sa.String(40), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("author_id", UUID),
        sa.Column("source_system_id", UUID),
        sa.Column("comment", sa.Text()),
        sa.Column("external_event_id", sa.String(255)),
        sa.ForeignKeyConstraint(["card_service_id"], ["card_service.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_system_id"], ["source_system.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint(
            "source_system_id", "external_event_id", name="uq_service_status_external_event"
        ),
    )
    op.create_index(
        "ix_service_status_card_service_time",
        "service_status_history",
        ["card_service_id", "occurred_at"],
    )

    op.create_table(
        "card_list_projection",
        sa.Column("card_id", UUID, primary_key=True),
        sa.Column("card_number", sa.String(64), nullable=False),
        sa.Column("event_type_id", sa.Integer(), nullable=False),
        sa.Column("event_kind_id", sa.Integer()),
        sa.Column("incident_address", sa.Text()),
        sa.Column("victims_count", sa.Integer()),
        sa.Column("current_status", sa.String(40), nullable=False),
        sa.Column("services_summary", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("features_summary", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["card_id"], ["incident_card.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_card_projection_status_registered",
        "card_list_projection",
        ["current_status", "registered_at"],
    )
    op.create_index(
        "ix_card_projection_event_registered",
        "card_list_projection",
        ["event_type_id", "registered_at"],
    )

    op.create_table(
        "outbox_event",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("aggregate_type", sa.String(100), nullable=False),
        sa.Column("aggregate_id", sa.String(64), nullable=False),
        sa.Column("aggregate_version", sa.BigInteger(), nullable=False),
        sa.Column("event_type", sa.String(150), nullable=False),
        sa.Column("topic", sa.String(255), nullable=False),
        sa.Column("message_key", sa.String(255), nullable=False),
        sa.Column("payload", JSONB, nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("available_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("locked_by", sa.String(255)),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "aggregate_type",
            "aggregate_id",
            "aggregate_version",
            name="uq_outbox_aggregate_version",
        ),
    )
    op.create_index(
        "ix_outbox_dispatch", "outbox_event", ["status", "available_at", "created_at"]
    )
    op.create_index(
        "ix_outbox_aggregate_order",
        "outbox_event",
        ["aggregate_type", "aggregate_id", "aggregate_version"],
    )

    _seed_classifier()
    _seed_reference_systems()


def _seed_classifier() -> None:
    event_type_table = sa.table(
        "event_type",
        sa.column("id", sa.Integer()),
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
    )
    event_kind_table = sa.table(
        "event_kind",
        sa.column("id", sa.Integer()),
        sa.column("event_type_id", sa.Integer()),
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
    )
    groups = []
    kinds = []
    kind_id = 1
    for group_id, (code, name, names) in enumerate(CLASSIFIER, start=1):
        groups.append(
            {"id": group_id, "code": code, "name": name, "sort_order": group_id, "is_active": True}
        )
        for order, kind_name in enumerate(names, start=1):
            kinds.append(
                {
                    "id": kind_id,
                    "event_type_id": group_id,
                    "code": str(order),
                    "name": kind_name,
                    "sort_order": order,
                    "is_active": True,
                }
            )
            kind_id += 1
    op.bulk_insert(event_type_table, groups)
    op.bulk_insert(event_kind_table, kinds)
    op.execute(
        "SELECT setval(pg_get_serial_sequence('event_type', 'id'), "
        "(SELECT max(id) FROM event_type), true)"
    )
    op.execute(
        "SELECT setval(pg_get_serial_sequence('event_kind', 'id'), "
        "(SELECT max(id) FROM event_kind), true)"
    )


def _seed_reference_systems() -> None:
    source_table = sa.table(
        "source_system",
        sa.column("id", UUID),
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("is_active", sa.Boolean()),
    )
    service_table = sa.table(
        "emergency_service",
        sa.column("id", UUID),
        sa.column("code", sa.String()),
        sa.column("name", sa.String()),
        sa.column("notification_method", sa.String()),
        sa.column("sort_order", sa.Integer()),
        sa.column("is_active", sa.Boolean()),
    )
    source_names = (
        ("POV_112", "ПОВ-112"),
        ("KIS_USS", "КИС УСС"),
        ("SODCH_MVD", "СОДЧ МВД"),
        ("KASU_SMP", "КАСУ СМП"),
        ("SYSTEM_104", "Система 104"),
        ("ERA_GLONASS", "ЭРА-ГЛОНАСС"),
        ("REGIONAL_112_MO", "Система-112 Московской области"),
        ("REGIONAL_112_KALUGA", "Система-112 Калужской области"),
    )
    namespace = uuid.UUID("4db6d747-f84b-4c37-855f-6b6a4d7b82bc")
    integrated_service_codes = {"101", "102", "103", "104", "MOSVODOCANAL", "ZODD"}
    combined_service_codes = {"DEP_RBIPK", "DGP"}
    op.bulk_insert(
        source_table,
        [
            {
                "id": uuid.uuid5(namespace, f"source:{code}"),
                "code": code,
                "name": name,
                "is_active": True,
            }
            for code, name in source_names
        ],
    )
    service_names = (
        ("101", "Служба 101"),
        ("ODS_PSC", "ОДС ПСЦ"),
        ("MGPSS", "МГПСС"),
        ("102", "Служба 102"),
        ("103", "Служба 103"),
        ("104", "Служба 104"),
        ("ZEMP", "ЦЭМП"),
        ("FSB", "ФСБ"),
        ("MOSOBLGAZ", "Мособлгаз"),
        ("AUTOROADS", "Автомобильные дороги"),
        ("MOSGORTRANS", "Мосгортранс"),
        ("GKH", "Городское хозяйство"),
        ("GORMOST", "ГОРМОСТ"),
        ("MOSCOW_CANAL", "Канал имени Москвы"),
        ("MGTS", "МГТС"),
        ("METRO", "Метро"),
        ("MOSVODOCANAL", "Мосводоканал"),
        ("MOEK", "МОЭК"),
        ("MOESK", 'МОЭСК (ПАО "Россети Московский регион")'),
        ("OEK", "ОЭК"),
        ("MOSLIFT", "Мослифт"),
        ("ZODD", "ЦОДД"),
        ("DEP_GKH", "Департамент ЖКХ"),
        ("DEP_RBIPK", "Департамент РБиПК (ГКУ МОСБЕЗ)"),
        ("MAYOR_OFFICE", "Аппарат Мэра"),
        ("MOSCOLLECTOR", "Москоллектор"),
        ("RZD", "РЖД"),
        ("DEP_EDUCATION", "Департамент образования"),
        ("CENTERREGIONVODKHOZ", "Центррегионводхоз (Московско-Окское БВУ)"),
        ("MILITARY_COMMANDANT", "Военная комендатура"),
        ("OATI", "ОАТИ"),
        ("MOSVODOSTOK", "Мосводосток"),
        ("DEP_PPIOOS", "Департамент ППиООС"),
        ("DEP_TSZN", "ОД Департамент ТСЗН"),
        ("RSVO", "РСВО"),
        ("EVAZHD", "ЭВАЖД"),
        ("MSPPN", "МСППН"),
        ("DTU_R", "ДТУ_Р (Ритуал)"),
        ("DTU", "ДТУ"),
        ("ROSGVARDIA", "Росгвардия"),
        ("TERRITORIAL_OIV", "Территориальные ОИВ"),
        ("TERRITORIAL_OIV_TINAO", "Территориальные ОИВ ТиНАО"),
        ("AUTOROADS_AO", "Автомобильные дороги АО г. Москвы"),
        ("DEP_CONSTRUCTION", "Департамент строительства города Москвы"),
        ("VET_COMMITTEE", "Комитет ветеринарии"),
        ("MOSZHILINSPEKTSIYA", "Мосжилинспекция"),
        ("DEP_CULTURE", "Департамент культуры"),
        ("CSA_GLINKA", "ГКУ ЦСА имени Е.П. Глинки"),
        ("GKU_NTU", "ГКУ НТУ"),
        ("FSO", "ФСО"),
        ("GUP_MSR", "ГУП МСР"),
        ("DEP_TOURISM", "Комитет по туризму г. Москвы"),
        ("DGP", "Департамент градостроительной политики"),
        ("CUKB_DEFENSE", "ЦУКБ Министерства обороны"),
        ("CUKB_UAV_DEFENSE", "ЦУКБ.БПЛА Министерства обороны"),
        ("TRANSPORT_ORGANIZER", "ГКУ Организатор перевозок"),
        ("MOSECOMONITORING", "ГПБУ Мосэкомониторинг"),
        ("DEFENSE_RCB", "Министерство обороны РХБЗ"),
        ("CITYENERGO", "ООО Ситиэнерго"),
        ("DEP_CIVIL_CONSTRUCTION", "Департамент гражданского строительства"),
    )
    op.bulk_insert(
        service_table,
        [
            {
                "id": uuid.uuid5(namespace, f"service:{code}"),
                "code": code,
                "name": name,
                "notification_method": (
                    "COMBINED"
                    if code in combined_service_codes
                    else "INTEGRATION"
                    if code in integrated_service_codes
                    else "ARM_112"
                ),
                "sort_order": order,
                "is_active": True,
            }
            for order, (code, name) in enumerate(service_names, start=1)
        ],
    )


def downgrade() -> None:
    op.drop_table("outbox_event")
    op.drop_table("card_list_projection")
    op.drop_table("service_status_history")
    op.drop_table("card_service_dispatch")
    op.drop_table("card_service")
    op.drop_table("card_event_type_history")
    op.drop_table("card_status_history")
    op.drop_table("card_feature_history")
    op.drop_table("card_feature")
    op.drop_table("incident_card")
    op.drop_table("service_routing_rule")
    op.drop_table("emergency_service")
    op.drop_table("source_system")
    op.drop_table("feature_schema")
    op.drop_table("incident_type")
    op.drop_table("third_order_feature")
    op.drop_table("second_order_feature")
    op.drop_table("first_order_feature")
    op.drop_table("event_kind")
    op.drop_table("event_type")
