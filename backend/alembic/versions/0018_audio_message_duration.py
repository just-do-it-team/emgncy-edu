"""Store measured audio-message duration.

Revision ID: 0018
Revises: 0017
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("audio_message", sa.Column("duration_ms", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "duration_nonnegative",
        "audio_message",
        "duration_ms IS NULL OR duration_ms >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_audio_message_duration_nonnegative", "audio_message", type_="check"
    )
    op.drop_column("audio_message", "duration_ms")
