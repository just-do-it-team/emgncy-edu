"""Track client presence for training workspace members.

Revision ID: 0020
Revises: 0019
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "workspace_member",
        sa.Column("last_presence_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_training_session_status_started",
        "training_session",
        ["status", "started_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_training_session_status_started", table_name="training_session")
    op.drop_column("workspace_member", "last_presence_at")
