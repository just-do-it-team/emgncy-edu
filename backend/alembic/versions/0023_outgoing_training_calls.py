"""Allow one outgoing training call alongside an incoming call on a card.

Revision ID: 0023
Revises: 0022
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "uq_training_call_incident_card_id", "training_call", type_="unique"
    )
    op.create_index(
        "uq_training_call_outgoing_card",
        "training_call",
        ["incident_card_id"],
        unique=True,
        postgresql_where=sa.text("direction = 'OUTBOUND'"),
    )


def downgrade() -> None:
    op.drop_index("uq_training_call_outgoing_card", table_name="training_call")
    op.create_unique_constraint(
        "uq_training_call_incident_card_id", "training_call", ["incident_card_id"]
    )
