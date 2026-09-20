"""Remove runtime-only fields from stored scenario card definitions.

Revision ID: 0004
Revises: 0003
"""

from typing import Sequence

from alembic import op


revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE training_scenario AS scenario
        SET definition = jsonb_set(
            scenario.definition,
            '{cards}',
            COALESCE(
                (
                    SELECT jsonb_agg(
                        CASE
                            WHEN jsonb_typeof(item.card->'initial_card') = 'object'
                            THEN jsonb_set(
                                item.card,
                                '{initial_card}',
                                (item.card->'initial_card') - 'workspace_id' - 'request_id'
                            )
                            ELSE item.card
                        END
                        ORDER BY item.ordinality
                    )
                    FROM jsonb_array_elements(scenario.definition->'cards')
                        WITH ORDINALITY AS item(card, ordinality)
                ),
                '[]'::jsonb
            )
        )
        WHERE jsonb_typeof(scenario.definition->'cards') = 'array'
          AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(scenario.definition->'cards') AS item(card)
              WHERE jsonb_typeof(item.card->'initial_card') = 'object'
                AND (
                    item.card->'initial_card' ? 'workspace_id'
                    OR item.card->'initial_card' ? 'request_id'
                )
          )
        """
    )


def downgrade() -> None:
    # Runtime values cannot be restored safely because they never belonged to a scenario.
    pass
