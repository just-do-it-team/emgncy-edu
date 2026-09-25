"""Store assembled training-call recordings.

Revision ID: 0019
Revises: 0018
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from s112.domain.models import JsonType


revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "training_call_recording",
        sa.Column("training_call_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("object_key", sa.String(1024)),
        sa.Column("content_type", sa.String(128)),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("sha256", sa.String(64)),
        sa.Column("duration_ms", sa.Integer()),
        sa.Column("source_manifest", JsonType, nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("processing_started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["training_call_id"], ["training_call.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("training_call_id"),
        sa.CheckConstraint(
            "status IN ('QUEUED', 'PROCESSING', 'READY', 'FAILED')",
            name="status_valid",
        ),
        sa.CheckConstraint("size_bytes IS NULL OR size_bytes >= 0", name="size_nonnegative"),
        sa.CheckConstraint("duration_ms IS NULL OR duration_ms >= 0", name="duration_nonnegative"),
    )
    op.create_index(
        "ix_training_call_recording_queue",
        "training_call_recording",
        ["status", "next_attempt_at"],
    )
    op.execute(
        "INSERT INTO training_call_recording "
        "(training_call_id, status, source_manifest, attempts) "
        "SELECT id, 'QUEUED', '[]', 0 FROM training_call "
        "WHERE status = 'COMPLETED' AND direction = 'INBOUND'"
    )


def downgrade() -> None:
    op.drop_index("ix_training_call_recording_queue", table_name="training_call_recording")
    op.drop_table("training_call_recording")
