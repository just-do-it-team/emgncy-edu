"""Add reliable STT and TTS audio-message pipeline state.

Revision ID: 0007
Revises: 0006
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "audio_message",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("training_session_id", UUID, nullable=False),
        sa.Column("workspace_id", UUID, nullable=False),
        sa.Column("incident_card_id", UUID),
        sa.Column("actor_user_id", UUID),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("direction", sa.String(16), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("sequence_no", sa.BigInteger(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("source_text", sa.Text()),
        sa.Column("transcript", sa.Text()),
        sa.Column("object_key", sa.String(1024), nullable=False),
        sa.Column("object_etag", sa.String(255)),
        sa.Column("sha256", sa.String(64)),
        sa.Column("content_type", sa.String(128)),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("sample_rate", sa.Integer()),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text()),
        sa.Column("client_sent_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("processing_started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("action_recorded_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "sequence_no > 0", name="sequence_positive"
        ),
        sa.CheckConstraint("revision > 0", name="revision_positive"),
        sa.CheckConstraint(
            "kind IN ('STT', 'TTS')", name="kind_valid"
        ),
        sa.CheckConstraint(
            "direction IN ('INBOUND', 'OUTBOUND')",
            name="direction_valid",
        ),
        sa.CheckConstraint(
            "status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')",
            name="status_valid",
        ),
        sa.CheckConstraint(
            "size_bytes IS NULL OR size_bytes >= 0",
            name="size_nonnegative",
        ),
        sa.ForeignKeyConstraint(
            ["training_session_id"],
            ["training_session.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["simulation_workspace.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["incident_card_id"], ["incident_card.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"], ["user_account.id"], ondelete="RESTRICT"
        ),
        sa.UniqueConstraint(
            "training_session_id",
            "idempotency_key",
            name="uq_audio_message_session_idempotency",
        ),
        sa.UniqueConstraint(
            "training_session_id",
            "sequence_no",
            name="uq_audio_message_session_sequence",
        ),
    )
    op.create_index(
        "ix_audio_message_session_sequence",
        "audio_message",
        ["training_session_id", "sequence_no"],
    )
    op.create_index(
        "ix_audio_message_card_sequence",
        "audio_message",
        ["incident_card_id", "sequence_no"],
    )
    op.create_index(
        "ix_audio_message_status_created",
        "audio_message",
        ["status", "created_at"],
    )

    op.create_table(
        "event_inbox",
        sa.Column("consumer_name", sa.String(100), primary_key=True),
        sa.Column("event_id", UUID, primary_key=True),
        sa.Column(
            "processed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_event_inbox_processed_at", "event_inbox", ["processed_at"]
    )


def downgrade() -> None:
    op.drop_table("event_inbox")
    op.drop_table("audio_message")
