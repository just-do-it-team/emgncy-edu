"""Store response unit numbers and card descriptions in the list projection.

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
    op.add_column("service_status_history", sa.Column("unit_number", sa.String(64)))
    connection = op.get_bind()
    op.add_column(
        "card_list_projection",
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
    )
    cards = sa.table(
        "incident_card", sa.column("id", sa.Uuid()), sa.column("description", sa.Text())
    )
    projections = sa.table(
        "card_list_projection",
        sa.column("card_id", sa.Uuid()),
        sa.column("description", sa.Text()),
    )
    connection.execute(
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
