"""Add administrator accounts, audit log and security policy.

Revision ID: 0002
Revises: 0001
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    op.create_table(
        "user_account",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("normalized_username", sa.String(64), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(320)),
        sa.Column("normalized_email", sa.String(320)),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(32), nullable=False, server_default="STUDENT"),
        sa.Column("is_blocked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("blocked_at", sa.DateTime(timezone=True)),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", UUID),
        sa.Column("updated_by", UUID),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "role IN ('ADMINISTRATOR', 'TEACHER', 'STUDENT')",
            name="ck_user_account_role_allowed",
        ),
        sa.UniqueConstraint("normalized_username", name="uq_user_account_normalized_username"),
        sa.UniqueConstraint("normalized_email", name="uq_user_account_normalized_email"),
    )
    op.create_index(
        "ix_user_account_role_blocked", "user_account", ["role", "is_blocked"]
    )

    op.create_table(
        "audit_event",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("actor_id", UUID),
        sa.Column("actor_username", sa.String(64)),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_type", sa.String(64), nullable=False),
        sa.Column("target_id", sa.String(128)),
        sa.Column("result", sa.String(20), nullable=False),
        sa.Column("details", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("user_agent", sa.String(512)),
        sa.Column("request_id", sa.String(128)),
    )
    op.create_index("ix_audit_event_occurred_at", "audit_event", ["occurred_at"])
    op.create_index("ix_audit_event_actor_time", "audit_event", ["actor_id", "occurred_at"])
    op.create_index("ix_audit_event_action_time", "audit_event", ["action", "occurred_at"])
    op.create_index("ix_audit_event_target", "audit_event", ["target_type", "target_id"])

    op.create_table(
        "security_policy",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("password_min_length", sa.Integer(), nullable=False, server_default="12"),
        sa.Column("require_uppercase", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("require_lowercase", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("require_digit", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("require_special", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_by", UUID),
        sa.CheckConstraint("id = 1", name="ck_security_policy_singleton"),
        sa.CheckConstraint(
            "password_min_length BETWEEN 8 AND 128",
            name="ck_security_policy_password_min_length_range",
        ),
    )
    op.execute(
        sa.text(
            "INSERT INTO security_policy "
            "(id, password_min_length, require_uppercase, require_lowercase, "
            "require_digit, require_special) "
            "VALUES (1, 12, true, true, true, true)"
        )
    )


def downgrade() -> None:
    op.drop_table("security_policy")
    op.drop_table("audit_event")
    op.drop_table("user_account")
