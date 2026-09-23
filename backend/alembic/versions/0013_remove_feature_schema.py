"""Remove unused feature schemas and route services by event kind.

Revision ID: 0013
Revises: 0012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _require_empty(table: str, predicate: str = "TRUE") -> None:
    count = op.get_bind().execute(
        sa.text(f"SELECT count(*) FROM {table} WHERE {predicate}")
    ).scalar_one()
    if count:
        raise RuntimeError(f"Cannot change feature_schema: {table} contains {count} dependent rows")


def _drop_foreign_key(table: str, column: str) -> None:
    for constraint in sa.inspect(op.get_bind()).get_foreign_keys(table):
        if constraint["constrained_columns"] == [column]:
            op.drop_constraint(constraint["name"], table, type_="foreignkey")
            return
    raise RuntimeError(f"Foreign key for {table}.{column} was not found")


def upgrade() -> None:
    # In deployments with populated schemas, their routing and JSON validation
    # need an explicit data migration. Never silently discard those settings.
    _require_empty("feature_schema")
    _require_empty("service_routing_rule")
    _require_empty("card_feature", "feature_schema_id IS NOT NULL")
    _require_empty("card_feature_history", "feature_schema_id IS NOT NULL")

    _drop_foreign_key("card_feature", "feature_schema_id")
    op.drop_column("card_feature", "feature_schema_id")
    op.drop_column("card_feature_history", "feature_schema_id")

    op.drop_index("ix_service_routing_rule_schema_active", table_name="service_routing_rule")
    op.drop_constraint(
        "uq_service_routing_rule_schema_service_route",
        "service_routing_rule",
        type_="unique",
    )
    _drop_foreign_key("service_routing_rule", "feature_schema_id")
    op.drop_column("service_routing_rule", "feature_schema_id")
    op.add_column("service_routing_rule", sa.Column("event_kind_id", sa.Integer(), nullable=False))
    op.create_foreign_key(
        "fk_service_routing_rule_event_kind_id_event_kind",
        "service_routing_rule",
        "event_kind",
        ["event_kind_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_service_routing_rule_kind_service_route",
        "service_routing_rule",
        ["event_kind_id", "service_id", "route_code"],
    )
    op.create_index(
        "ix_service_routing_rule_kind_active",
        "service_routing_rule",
        ["event_kind_id", "is_active"],
    )
    op.drop_table("feature_schema")


def downgrade() -> None:
    _require_empty("service_routing_rule")
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
        sa.ForeignKeyConstraint(["first_order_feature_id"], ["first_order_feature.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["second_order_feature_id"], ["second_order_feature.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["third_order_feature_id"], ["third_order_feature.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["incident_type_id"], ["incident_type.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint(
            "event_kind_id", "first_order_feature_id", "second_order_feature_id",
            "third_order_feature_id", "version", name="uq_feature_schema_hierarchy_version",
        ),
    )
    op.add_column("card_feature", sa.Column("feature_schema_id", UUID))
    op.create_foreign_key(
        "fk_card_feature_feature_schema_id_feature_schema",
        "card_feature", "feature_schema", ["feature_schema_id"], ["id"], ondelete="RESTRICT",
    )
    op.add_column("card_feature_history", sa.Column("feature_schema_id", UUID))

    op.drop_index("ix_service_routing_rule_kind_active", table_name="service_routing_rule")
    op.drop_constraint(
        "uq_service_routing_rule_kind_service_route", "service_routing_rule", type_="unique",
    )
    _drop_foreign_key("service_routing_rule", "event_kind_id")
    op.drop_column("service_routing_rule", "event_kind_id")
    op.add_column("service_routing_rule", sa.Column("feature_schema_id", UUID, nullable=False))
    op.create_foreign_key(
        "fk_service_routing_rule_feature_schema_id_feature_schema",
        "service_routing_rule", "feature_schema", ["feature_schema_id"], ["id"], ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_service_routing_rule_schema_service_route", "service_routing_rule",
        ["feature_schema_id", "service_id", "route_code"],
    )
    op.create_index(
        "ix_service_routing_rule_schema_active", "service_routing_rule",
        ["feature_schema_id", "is_active"],
    )
