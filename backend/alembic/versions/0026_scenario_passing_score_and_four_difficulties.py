"""Add scenario passing score and limit difficulty to four levels.

Revision ID: 0026
Revises: 0025
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


DIFFICULTY_TABLES = (
    "card_template",
    "incoming_call_template",
    "training_scenario",
)

EXISTING_DIFFICULTY_CONSTRAINTS = {
    "card_template": "ck_card_template_ck_card_template_difficulty_range",
    "incoming_call_template": "ck_incoming_call_template_difficulty_range",
    "training_scenario": "ck_training_scenario_ck_training_scenario_difficulty_range",
}


def upgrade() -> None:
    for table_name in DIFFICULTY_TABLES:
        op.execute(
            sa.text(f"UPDATE {table_name} SET difficulty = 4 WHERE difficulty = 5")
        )
        op.drop_constraint(
            op.f(EXISTING_DIFFICULTY_CONSTRAINTS[table_name]),
            table_name,
            type_="check",
        )
        op.create_check_constraint(
            "difficulty_range",
            table_name,
            "difficulty BETWEEN 1 AND 4",
        )

    op.add_column(
        "training_scenario",
        sa.Column(
            "passing_score",
            sa.Numeric(5, 2),
            nullable=False,
            server_default="100",
        ),
    )
    op.create_check_constraint(
        "passing_score_range",
        "training_scenario",
        "passing_score BETWEEN 0 AND 100",
    )
    op.alter_column("training_scenario", "passing_score", server_default=None)


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_training_scenario_passing_score_range"),
        "training_scenario",
        type_="check",
    )
    op.drop_column("training_scenario", "passing_score")

    for table_name in DIFFICULTY_TABLES:
        op.drop_constraint(
            op.f(f"ck_{table_name}_difficulty_range"), table_name, type_="check"
        )
        op.create_check_constraint(
            "difficulty_range",
            table_name,
            "difficulty BETWEEN 1 AND 5",
        )
