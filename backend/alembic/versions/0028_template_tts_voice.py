"""Add optional TTS voice to templates and generated audio messages.

Revision ID: 0028
Revises: 0027
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TABLES = ("card_template", "incoming_call_template", "audio_message")


def upgrade() -> None:
    for table in TABLES:
        op.add_column(table, sa.Column("voice_id", sa.String(length=128)))


def downgrade() -> None:
    for table in reversed(TABLES):
        op.drop_column(table, "voice_id")
