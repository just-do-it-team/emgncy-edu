"""Assign shared calls and protect participant positions.

Revision ID: 0014
Revises: 0013
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    duplicate_position = connection.execute(
        sa.text(
            "SELECT assignment_id, position_code FROM assignment_participant "
            "WHERE position_code IS NOT NULL "
            "GROUP BY assignment_id, position_code HAVING count(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicate_position is not None:
        raise RuntimeError(
            "Resolve duplicate DDS positions in scenario assignments before migration 0014"
        )
    duplicate_active_user = connection.execute(
        sa.text(
            "SELECT user_id FROM assignment_participant WHERE status = 'RUNNING' "
            "GROUP BY user_id HAVING count(*) > 1 LIMIT 1"
        )
    ).first()
    if duplicate_active_user is not None:
        raise RuntimeError(
            "Resolve overlapping active training sessions before migration 0014"
        )

    op.add_column(
        "training_call",
        sa.Column("assigned_operator_user_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_training_call_assigned_operator_user_id",
        "training_call",
        "user_account",
        ["assigned_operator_user_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "uq_assignment_participant_dds_position",
        "assignment_participant",
        ["assignment_id", "position_code"],
        unique=True,
        postgresql_where=sa.text("position_code IS NOT NULL"),
        sqlite_where=sa.text("position_code IS NOT NULL"),
    )
    op.create_index(
        "uq_assignment_participant_one_running_user",
        "assignment_participant",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'RUNNING'"),
        sqlite_where=sa.text("status = 'RUNNING'"),
    )


def downgrade() -> None:
    op.drop_index("uq_assignment_participant_one_running_user", table_name="assignment_participant")
    op.drop_index("uq_assignment_participant_dds_position", table_name="assignment_participant")
    op.drop_constraint(
        "fk_training_call_assigned_operator_user_id",
        "training_call",
        type_="foreignkey",
    )
    op.drop_column("training_call", "assigned_operator_user_id")
