"""Queue recordings for outgoing calls completed before recording support.

Revision ID: 0024
Revises: 0023
"""

from collections.abc import Sequence

from alembic import op


revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "INSERT INTO training_call_recording "
        "(training_call_id, status, source_manifest, attempts) "
        "SELECT tc.id, 'QUEUED', '[]', 0 FROM training_call AS tc "
        "WHERE tc.status = 'COMPLETED' AND tc.direction = 'OUTBOUND' "
        "AND NOT EXISTS ("
        "SELECT 1 FROM training_call_recording AS r "
        "WHERE r.training_call_id = tc.id"
        ")"
    )


def downgrade() -> None:
    # Completed recordings cannot be distinguished from newer ones safely.
    pass
