"""Seed the default teacher and students used by training scenarios.

Revision ID: 0003
Revises: 0002
"""

import uuid
from typing import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


UUID = postgresql.UUID(as_uuid=True)

USERS = (
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000201"),
        "username": "yWJJ9_z",
        "display_name": "Алексеев Владимир",
        "email": "alekseevv@ya.ru",
        "role": "TEACHER",
        "password_hash": (
            "pbkdf2_sha256$600000$b0spovtkwrxDwUUoNRt1kw=="
            "$RReKRAsfENhoW_SdEYkjJ7Q58wazxypreG9o-50c3rg="
        ),
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000202"),
        "username": "yWJJ9_y",
        "display_name": "Иванов Валентин",
        "email": "ivanovv@ya.ru",
        "role": "STUDENT",
        "password_hash": (
            "pbkdf2_sha256$600000$w_T3kv6n5euIB0P03P5leg=="
            "$mv6u8sAaa57cll88-I4wCVsyuecyH5jaTCmK34WYs0k="
        ),
    },
    {
        "id": uuid.UUID("00000000-0000-0000-0000-000000000203"),
        "username": "yWJJ9_x",
        "display_name": "Андреева Анна",
        "email": "andreevaa@ya.ru",
        "role": "STUDENT",
        "password_hash": (
            "pbkdf2_sha256$600000$L68BQzoviDsIb32iri1EQA=="
            "$P7bTzHUJb18vjs6UQr7IlQEh_SVY5yDcGi9vsL4fBpE="
        ),
    },
)


def upgrade() -> None:
    user_table = sa.table(
        "user_account",
        sa.column("id", UUID),
        sa.column("username", sa.String()),
        sa.column("normalized_username", sa.String()),
        sa.column("display_name", sa.String()),
        sa.column("email", sa.String()),
        sa.column("normalized_email", sa.String()),
        sa.column("password_hash", sa.Text()),
        sa.column("role", sa.String()),
        sa.column("is_blocked", sa.Boolean()),
        sa.column("blocked_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    for user in USERS:
        values = {
            **user,
            "normalized_username": user["username"].lower(),
            "normalized_email": user["email"].lower(),
            "is_blocked": False,
            "blocked_at": None,
        }
        statement = postgresql.insert(user_table).values(**values)
        op.execute(
            statement.on_conflict_do_update(
                index_elements=[user_table.c.normalized_username],
                set_={
                    "username": statement.excluded.username,
                    "display_name": statement.excluded.display_name,
                    "email": statement.excluded.email,
                    "normalized_email": statement.excluded.normalized_email,
                    "password_hash": statement.excluded.password_hash,
                    "role": statement.excluded.role,
                    "is_blocked": False,
                    "blocked_at": None,
                    "updated_at": sa.func.now(),
                },
            )
        )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM user_account WHERE id IN (:teacher_id, :student_1_id, :student_2_id)")
        .bindparams(
            sa.bindparam("teacher_id", value=USERS[0]["id"], type_=UUID),
            sa.bindparam("student_1_id", value=USERS[1]["id"], type_=UUID),
            sa.bindparam("student_2_id", value=USERS[2]["id"], type_=UUID),
        )
    )
