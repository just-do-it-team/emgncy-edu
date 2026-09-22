"""Add procedural scenario runtime state and generated-card identity.

Revision ID: 0010
Revises: 0009
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UUID = postgresql.UUID(as_uuid=True)
JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.add_column(
        "training_session",
        sa.Column(
            "generation_state",
            JSON,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "session_scheduled_card",
        sa.Column("generator_key", sa.String(100)),
    )
    op.add_column(
        "session_scheduled_card",
        sa.Column("generation_index", sa.Integer()),
    )
    op.add_column(
        "session_scheduled_card",
        sa.Column("source_template_id", UUID),
    )
    op.create_foreign_key(
        "fk_session_scheduled_card_source_template_id_card_template",
        "session_scheduled_card",
        "card_template",
        ["source_template_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_unique_constraint(
        "uq_session_scheduled_card_generation",
        "session_scheduled_card",
        ["training_session_id", "generator_key", "generation_index"],
    )
    op.create_check_constraint(
        "ck_session_scheduled_card_generation_fields_valid",
        "session_scheduled_card",
        "(generator_key IS NULL AND generation_index IS NULL) OR "
        "(generator_key IS NOT NULL AND generation_index > 0)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_session_scheduled_card_generation_fields_valid",
        "session_scheduled_card",
        type_="check",
    )
    op.drop_constraint(
        "uq_session_scheduled_card_generation",
        "session_scheduled_card",
        type_="unique",
    )
    op.drop_constraint(
        "fk_session_scheduled_card_source_template_id_card_template",
        "session_scheduled_card",
        type_="foreignkey",
    )
    op.drop_column("session_scheduled_card", "source_template_id")
    op.drop_column("session_scheduled_card", "generation_index")
    op.drop_column("session_scheduled_card", "generator_key")
    op.drop_column("training_session", "generation_state")
