"""Add learning groups, assignment batches and expert assessment fields.

Revision ID: 0005
Revises: 0004
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "learning_group",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("teacher_id", UUID, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["teacher_id"], ["user_account.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint(
            "teacher_id", "name", name="uq_learning_group_teacher_name"
        ),
    )
    op.create_index(
        "ix_learning_group_teacher_active",
        "learning_group",
        ["teacher_id", "is_active"],
    )

    op.create_table(
        "learning_group_member",
        sa.Column("group_id", UUID, primary_key=True),
        sa.Column("student_id", UUID, primary_key=True),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("removed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["group_id"], ["learning_group.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["user_account.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_learning_group_member_student_active",
        "learning_group_member",
        ["student_id", "removed_at"],
    )

    op.create_table(
        "assignment_batch",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("group_id", UUID, nullable=False),
        sa.Column("scenario_id", UUID, nullable=False),
        sa.Column("assigned_by", UUID, nullable=False),
        sa.Column("launch_policy", sa.String(40), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("available_from", sa.DateTime(timezone=True)),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["group_id"], ["learning_group.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["scenario_id"], ["training_scenario.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["assigned_by"], ["user_account.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("max_attempts >= 1", name="ck_assignment_batch_max_attempts_positive"),
    )
    op.create_index(
        "ix_assignment_batch_group_created",
        "assignment_batch",
        ["group_id", "created_at"],
    )

    op.add_column("scenario_assignment", sa.Column("assignment_batch_id", UUID))
    op.create_foreign_key(
        "fk_scenario_assignment_assignment_batch_id_assignment_batch",
        "scenario_assignment",
        "assignment_batch",
        ["assignment_batch_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_scenario_assignment_batch",
        "scenario_assignment",
        ["assignment_batch_id"],
    )

    op.add_column("training_session", sa.Column("expert_score", sa.Numeric(5, 2)))
    op.add_column("training_session", sa.Column("expert_passed", sa.Boolean()))
    op.add_column("training_session", sa.Column("expert_comment", sa.Text()))
    op.add_column("training_session", sa.Column("expert_evaluated_by", UUID))
    op.add_column(
        "training_session", sa.Column("expert_evaluated_at", sa.DateTime(timezone=True))
    )
    op.create_foreign_key(
        "fk_training_session_expert_evaluated_by_user_account",
        "training_session",
        "user_account",
        ["expert_evaluated_by"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "ck_training_session_expert_score_range",
        "training_session",
        "expert_score IS NULL OR (expert_score >= 0 AND expert_score <= 100)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_training_session_expert_score_range", "training_session", type_="check"
    )
    op.drop_constraint(
        "fk_training_session_expert_evaluated_by_user_account",
        "training_session",
        type_="foreignkey",
    )
    op.drop_column("training_session", "expert_evaluated_at")
    op.drop_column("training_session", "expert_evaluated_by")
    op.drop_column("training_session", "expert_comment")
    op.drop_column("training_session", "expert_passed")
    op.drop_column("training_session", "expert_score")

    op.drop_index("ix_scenario_assignment_batch", table_name="scenario_assignment")
    op.drop_constraint(
        "fk_scenario_assignment_assignment_batch_id_assignment_batch",
        "scenario_assignment",
        type_="foreignkey",
    )
    op.drop_column("scenario_assignment", "assignment_batch_id")

    op.drop_index("ix_assignment_batch_group_created", table_name="assignment_batch")
    op.drop_table("assignment_batch")
    op.drop_index(
        "ix_learning_group_member_student_active", table_name="learning_group_member"
    )
    op.drop_table("learning_group_member")
    op.drop_index("ix_learning_group_teacher_active", table_name="learning_group")
    op.drop_table("learning_group")
