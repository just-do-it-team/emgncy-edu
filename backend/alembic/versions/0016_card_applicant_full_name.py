"""Store the applicant's full name on incident cards.

Revision ID: 0016
Revises: 0015
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "incident_card",
        sa.Column("applicant_full_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "card_list_projection",
        sa.Column("applicant_full_name", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("card_list_projection", "applicant_full_name")
    op.drop_column("incident_card", "applicant_full_name")
