"""Add the index used by workspace card cursor pagination.

Revision ID: 0009
Revises: 0008
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_card_projection_workspace_registered_card",
        "card_list_projection",
        ["workspace_id", "registered_at", "card_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_card_projection_workspace_registered_card",
        table_name="card_list_projection",
    )
