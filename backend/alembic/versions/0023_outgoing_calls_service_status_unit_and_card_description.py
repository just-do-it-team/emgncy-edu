"""Add outgoing training calls, response unit numbers, and card descriptions.

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

    op.add_column("service_status_history", sa.Column("unit_number", sa.String(64)))

    op.add_column(
        "card_list_projection",
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
    )
    cards = sa.table(
        "incident_card",
        sa.column("id", sa.Uuid()),
        sa.column("description", sa.Text()),
    )
    projections = sa.table(
        "card_list_projection",
        sa.column("card_id", sa.Uuid()),
        sa.column("description", sa.Text()),
    )
    op.get_bind().execute(
        sa.update(projections).values(
            description=sa.select(sa.func.substr(cards.c.description, 1, 500))
            .where(cards.c.id == projections.c.card_id)
            .scalar_subquery()
        )
    )
    op.alter_column("card_list_projection", "description", server_default=None)


def downgrade() -> None:
    op.drop_column("card_list_projection", "description")
    op.drop_column("service_status_history", "unit_number")

    op.drop_index("uq_training_call_outgoing_card", table_name="training_call")
    op.create_unique_constraint(
        "uq_training_call_incident_card_id", "training_call", ["incident_card_id"]
    )
