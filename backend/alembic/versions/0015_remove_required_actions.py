"""Remove obsolete action requirements from persisted scenario content.

Revision ID: 0015
Revises: 0014
"""

from collections.abc import Sequence
from copy import deepcopy
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _expected_call_text(action: dict[str, Any], rule: dict[str, Any]) -> str | None:
    parameters = action.get("parameters") or {}
    transcript = parameters.get("expected_transcript") or {}
    if not isinstance(transcript, dict):
        return None
    comparison_field = rule.get("comparison_field", "required_facts")
    for value in (
        transcript.get(comparison_field),
        transcript.get("required_facts"),
        transcript.get("reference_text"),
    ):
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _normalize_expected(container: dict[str, Any], location: str) -> bool:
    expected = container.get("expected_result")
    if not isinstance(expected, dict):
        return False
    changed = False
    actions = expected.pop("required_actions", None)
    if actions is not None:
        changed = True
    rules = container.get("evaluation_rules")
    legacy_rule = rules.get("call_evaluation") if isinstance(rules, dict) else None
    if legacy_rule is not None and not isinstance(legacy_rule, dict):
        raise RuntimeError(f"Invalid call_evaluation at {location}")
    call_actions = [
        action
        for action in (actions or [])
        if isinstance(action, dict)
        and action.get("action_type") == "RESPONSE_TEAM_LEADER_CALLED"
    ]
    if expected.get("outbound_call") is None and (legacy_rule is not None or call_actions):
        if len(call_actions) != 1:
            raise RuntimeError(f"Cannot migrate outbound call reference at {location}")
        expected_text = _expected_call_text(call_actions[0], legacy_rule or {})
        if expected_text is None:
            if legacy_rule is not None:
                raise RuntimeError(f"Missing outbound call reference text at {location}")
        else:
            expected["outbound_call"] = {
                "expected_text": expected_text,
                "minimum_similarity": (legacy_rule or {}).get("minimum_similarity", 0.8),
            }
    if legacy_rule is not None:
        del rules["call_evaluation"]
        changed = True
    return changed


def _normalize_nested(value: Any, location: str) -> bool:
    if isinstance(value, list):
        changed = False
        for index, item in enumerate(value):
            changed = _normalize_nested(item, f"{location}[{index}]") or changed
        return changed
    if not isinstance(value, dict):
        return False
    changed = _normalize_expected(value, location)
    for key, child in value.items():
        if key not in {"expected_result", "evaluation_rules"}:
            changed = _normalize_nested(child, f"{location}.{key}") or changed
    return changed


def _rewrite_table(table_name: str, json_columns: tuple[str, ...]) -> None:
    table = sa.table(
        table_name,
        sa.column("id", UUID(as_uuid=True)),
        *(sa.column(name, JSONB) for name in json_columns),
    )
    connection = op.get_bind()
    for row in connection.execute(sa.select(table)).mappings().all():
        values = {name: deepcopy(row[name]) for name in json_columns}
        wrapper = values if "expected_result" in values else values[json_columns[0]]
        if _normalize_nested(wrapper, f"{table_name}:{row['id']}"):
            connection.execute(
                table.update().where(table.c.id == row["id"]).values(**values)
            )


def upgrade() -> None:
    _rewrite_table("card_template", ("expected_result", "evaluation_rules"))
    _rewrite_table("incoming_call_template", ("expected_result",))
    _rewrite_table("training_scenario", ("definition",))
    _rewrite_table("scenario_assignment", ("scenario_snapshot",))
    _rewrite_table("session_scheduled_card", ("expected_result", "evaluation_rules"))
    _rewrite_table("training_call", ("expected_result",))


def downgrade() -> None:
    raise RuntimeError(
        "Migration 0015 removes obsolete action requirements; restore a database "
        "backup to recover their original values"
    )
