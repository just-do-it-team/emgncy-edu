"""Add template publication state and asynchronous AI generation jobs.

Revision ID: 0027
Revises: 0026
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TEMPLATE_TABLES = ("card_template", "incoming_call_template")
GENERATION_FOREIGN_KEYS = {
    "card_template": "fk_card_tpl_generation",
    "incoming_call_template": "fk_call_tpl_generation",
}


def upgrade() -> None:
    for table_name in TEMPLATE_TABLES:
        op.add_column(
            table_name,
            sa.Column(
                "status",
                sa.String(length=32),
                nullable=False,
                server_default="PUBLISHED",
            ),
        )
        op.add_column(
            table_name,
            sa.Column(
                "generated_by_ai",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )
        op.add_column(table_name, sa.Column("ai_review_state", JSONB()))
        op.add_column(table_name, sa.Column("generation_id", UUID(as_uuid=True)))
        op.create_check_constraint(
            "status_valid",
            table_name,
            "status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')",
        )
        op.create_index(
            f"ix_{table_name}_status_active",
            table_name,
            ["status", "is_active"],
        )
        op.execute(
            sa.text(
                f"UPDATE {table_name} SET status = 'ARCHIVED' WHERE is_active = false"
            )
        )
        op.alter_column(table_name, "status", server_default=None)
        op.alter_column(table_name, "generated_by_ai", server_default=None)

    op.create_table(
        "card_template_generation",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("dds_service_codes", JSONB(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text()),
        sa.Column("incoming_call_template_id", UUID(as_uuid=True)),
        sa.Column("card_template_ids", JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("attempts >= 0", name="ck_card_template_generation_attempts_nonnegative"),
        sa.CheckConstraint(
            "status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')",
            name="ck_card_template_generation_status_valid",
        ),
        sa.ForeignKeyConstraint(
            ["incoming_call_template_id"],
            ["incoming_call_template.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["user_account.id"], ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_card_template_generation_status_created",
        "card_template_generation",
        ["status", "created_at"],
    )
    op.create_index(
        "ix_card_template_generation_author_created",
        "card_template_generation",
        ["created_by", "created_at"],
    )
    for table_name in TEMPLATE_TABLES:
        op.create_foreign_key(
            GENERATION_FOREIGN_KEYS[table_name],
            table_name,
            "card_template_generation",
            ["generation_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    for table_name in reversed(TEMPLATE_TABLES):
        op.drop_constraint(
            GENERATION_FOREIGN_KEYS[table_name],
            table_name,
            type_="foreignkey",
        )
    op.drop_index(
        "ix_card_template_generation_author_created",
        table_name="card_template_generation",
    )
    op.drop_index(
        "ix_card_template_generation_status_created",
        table_name="card_template_generation",
    )
    op.drop_table("card_template_generation")

    for table_name in reversed(TEMPLATE_TABLES):
        op.drop_index(f"ix_{table_name}_status_active", table_name=table_name)
        op.drop_constraint(
            op.f(f"ck_{table_name}_status_valid"), table_name, type_="check"
        )
        op.drop_column(table_name, "generation_id")
        op.drop_column(table_name, "ai_review_state")
        op.drop_column(table_name, "generated_by_ai")
        op.drop_column(table_name, "status")
