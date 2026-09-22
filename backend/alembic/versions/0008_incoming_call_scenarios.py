"""Add reusable incoming-call templates and mixed scenario runtime calls.

Revision ID: 0008
Revises: 0007
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UUID = postgresql.UUID(as_uuid=True)
JSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade() -> None:
    op.create_table(
        "incoming_call_template",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("template_key", UUID, nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("difficulty", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("initial_call", JSON, nullable=False),
        sa.Column("expected_result", JSON, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", UUID, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "version >= 1", name="version_positive"
        ),
        sa.CheckConstraint(
            "difficulty BETWEEN 1 AND 5",
            name="difficulty_range",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["user_account.id"], ondelete="RESTRICT"
        ),
        sa.UniqueConstraint(
            "template_key",
            "version",
            name="uq_incoming_call_template_key_version",
        ),
    )
    op.create_index(
        "ix_incoming_call_template_active_name",
        "incoming_call_template",
        ["is_active", "name"],
    )

    op.create_table(
        "training_call",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("training_session_id", UUID, nullable=False),
        sa.Column("workspace_id", UUID, nullable=False),
        sa.Column("scenario_item_key", sa.String(100), nullable=False),
        sa.Column("trigger_type", sa.String(32), nullable=False),
        sa.Column("trigger_config", JSON, nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("call_payload", JSON, nullable=False),
        sa.Column("expected_result", JSON, nullable=False),
        sa.Column("scheduled_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(32), nullable=False, server_default="PENDING"),
        sa.Column("incident_card_id", UUID, unique=True),
        sa.Column("ringing_at", sa.DateTime(timezone=True)),
        sa.Column("answered_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text()),
        sa.CheckConstraint(
            "status IN ('PENDING', 'RINGING', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED')",
            name="status_valid",
        ),
        sa.ForeignKeyConstraint(
            ["training_session_id"], ["training_session.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"], ["simulation_workspace.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["incident_card_id"], ["incident_card.id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint(
            "training_session_id",
            "scenario_item_key",
            name="uq_training_call_session_item",
        ),
    )
    op.create_index(
        "ix_training_call_due", "training_call", ["status", "scheduled_at"]
    )
    op.create_index(
        "ix_training_call_workspace", "training_call", ["workspace_id", "status"]
    )

    op.add_column("audio_message", sa.Column("training_call_id", UUID))
    op.create_foreign_key(
        "fk_audio_message_training_call_id_training_call",
        "audio_message",
        "training_call",
        ["training_call_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_audio_message_call_sequence",
        "audio_message",
        ["training_call_id", "sequence_no"],
    )


def downgrade() -> None:
    op.drop_index("ix_audio_message_call_sequence", table_name="audio_message")
    op.drop_constraint(
        "fk_audio_message_training_call_id_training_call",
        "audio_message",
        type_="foreignkey",
    )
    op.drop_column("audio_message", "training_call_id")
    op.drop_table("training_call")
    op.drop_table("incoming_call_template")
