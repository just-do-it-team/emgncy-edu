"""Persist operator 112 classifier selections independently of legacy event types.

Revision ID: 0021
Revises: 0020
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("incident_card", sa.Column("classification", JSONB, nullable=True))
    op.add_column("card_list_projection", sa.Column("classification", JSONB, nullable=True))
    op.alter_column("incident_card", "event_type_id", nullable=True)
    op.alter_column("card_list_projection", "event_type_id", nullable=True)


def downgrade() -> None:
    raise RuntimeError(
        "Operator cards have no legacy event type; remove or convert them "
        "before reverting migration 0021"
    )
