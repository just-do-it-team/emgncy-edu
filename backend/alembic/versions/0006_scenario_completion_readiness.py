"""Add scenario completion policies and persisted readiness state.

Revision ID: 0006
Revises: 0005
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "training_scenario",
        sa.Column("completion_policy", sa.String(32), nullable=True),
    )
    op.execute(
        "UPDATE training_scenario "
        "SET completion_policy = CASE "
        "WHEN workspace_mode = 'SHARED' THEN 'TEACHER_ONLY' "
        "ELSE 'STUDENT_CONFIRM' END"
    )
    op.alter_column(
        "training_scenario",
        "completion_policy",
        nullable=False,
        server_default="STUDENT_CONFIRM",
    )
    op.create_check_constraint(
        "ck_training_scenario_completion_policy_valid",
        "training_scenario",
        "completion_policy IN ('STUDENT_CONFIRM', 'AUTO_WHEN_READY', 'TEACHER_ONLY')",
    )

    op.add_column(
        "training_session",
        sa.Column("completion_policy", sa.String(32), nullable=True),
    )
    op.execute(
        "UPDATE training_session AS ts "
        "SET completion_policy = CASE "
        "WHEN sa.workspace_mode = 'SHARED' THEN 'TEACHER_ONLY' "
        "ELSE 'STUDENT_CONFIRM' END "
        "FROM scenario_assignment AS sa "
        "WHERE sa.id = ts.assignment_id"
    )
    op.execute(
        "UPDATE training_session SET completion_policy = 'STUDENT_CONFIRM' "
        "WHERE completion_policy IS NULL"
    )
    op.alter_column(
        "training_session",
        "completion_policy",
        nullable=False,
        server_default="STUDENT_CONFIRM",
    )
    op.add_column(
        "training_session",
        sa.Column(
            "completion_state",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "training_session",
        sa.Column(
            "completion_state_revision",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "training_session",
        sa.Column("ready_to_complete_at", sa.DateTime(timezone=True)),
    )
    op.add_column(
        "training_session",
        sa.Column(
            "completed_automatically",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.create_check_constraint(
        "ck_training_session_completion_policy_valid",
        "training_session",
        "completion_policy IN ('STUDENT_CONFIRM', 'AUTO_WHEN_READY', 'TEACHER_ONLY')",
    )
    op.create_check_constraint(
        "ck_training_session_completion_state_revision_nonnegative",
        "training_session",
        "completion_state_revision >= 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_training_session_completion_state_revision_nonnegative",
        "training_session",
        type_="check",
    )
    op.drop_constraint(
        "ck_training_session_completion_policy_valid",
        "training_session",
        type_="check",
    )
    op.drop_column("training_session", "completed_automatically")
    op.drop_column("training_session", "ready_to_complete_at")
    op.drop_column("training_session", "completion_state_revision")
    op.drop_column("training_session", "completion_state")
    op.drop_column("training_session", "completion_policy")

    op.drop_constraint(
        "ck_training_scenario_completion_policy_valid",
        "training_scenario",
        type_="check",
    )
    op.drop_column("training_scenario", "completion_policy")
