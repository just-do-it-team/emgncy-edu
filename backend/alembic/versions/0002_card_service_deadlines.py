"""Add service handling deadlines and participant positions.

Revision ID: 0002
Revises: 0001
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "assignment_participant",
        sa.Column("position_code", sa.String(100), nullable=True),
    )
    op.add_column(
        "card_service",
        sa.Column("decision_deadline_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "card_service",
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "card_service",
        sa.Column("open_deadline_missed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "card_service",
        sa.Column("decision_deadline_missed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_card_service_decision_deadline",
        "card_service",
        ["current_status", "decision_deadline_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_card_service_decision_deadline", table_name="card_service")
    op.drop_column("card_service", "decision_deadline_missed_at")
    op.drop_column("card_service", "open_deadline_missed_at")
    op.drop_column("card_service", "decided_at")
    op.drop_column("card_service", "decision_deadline_at")
    op.drop_column("assignment_participant", "position_code")
