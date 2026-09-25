"""Store optional contact details entered by the operator.

Revision ID: 0022
Revises: 0021
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("incident_card", sa.Column("automatic_phone_number", sa.String(64)))
    op.add_column("incident_card", sa.Column("provided_phone_number", sa.String(64)))
    op.add_column("incident_card", sa.Column("location_phone_number", sa.String(64)))


def downgrade() -> None:
    op.drop_column("incident_card", "location_phone_number")
    op.drop_column("incident_card", "provided_phone_number")
    op.drop_column("incident_card", "automatic_phone_number")
