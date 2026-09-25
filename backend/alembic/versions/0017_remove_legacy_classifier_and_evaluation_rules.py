"""Remove legacy fields and normalize persisted training expectations.

Revision ID: 0017
Revises: 0016
"""

from collections.abc import Sequence
from copy import deepcopy
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_EXPECTED_CARD_FIELDS = {
    "event_type_id",
    "description",
    "questionnaire",
    "reported_address",
    "incident_address",
    "victims_count",
    "current_status",
    "features",
    "services",
    "service_statuses",
}
_SERVICE_BY_EVENT_TYPE = {1: "101", 2: "102", 3: "103", 4: "104"}
_RESPONSE_UNIT_BY_SERVICE = {
    "101": ("Пожарный расчёт", "направлен", "выехал", "прибыл", "приступил"),
    "102": ("Наряд полиции", "направлен", "выехал", "прибыл", "приступил"),
    "103": (
        "Бригада скорой медицинской помощи",
        "направлена",
        "выехала",
        "прибыла",
        "приступила",
    ),
    "104": (
        "Аварийная газовая бригада",
        "направлена",
        "выехала",
        "прибыла",
        "приступила",
    ),
}
_REMOVED_FEATURE_COLUMNS = {
    "first_order_feature_id",
    "second_order_feature_id",
    "third_order_feature_id",
    "incident_type_id",
}


def _full_expected_card(
    initial: dict[str, Any],
    partial: dict[str, Any],
    rules: dict[str, Any],
    *,
    has_outbound_call: bool,
) -> dict[str, Any]:
    card = {
        key: deepcopy(value)
        for key, value in initial.items()
        if key in _EXPECTED_CARD_FIELDS
    }
    for key, value in partial.items():
        if key == "features" and isinstance(value, dict):
            card["features"] = {**(card.get("features") or {}), **deepcopy(value)}
        elif key in _EXPECTED_CARD_FIELDS:
            card[key] = deepcopy(value)

    features = card.get("features")
    if isinstance(features, dict):
        for key in _REMOVED_FEATURE_COLUMNS:
            features.pop(key, None)
        features.setdefault("additional_features", {})

    card.setdefault("description", "")
    card.setdefault("questionnaire", None)
    card.setdefault("reported_address", None)
    card.setdefault("incident_address", None)
    card.setdefault("victims_count", None)
    card.setdefault("current_status", "REGISTERED")

    services = card.get("services")
    if not isinstance(services, list):
        services = []
    operator_service = rules.get("operator_service_code")
    if not services and isinstance(operator_service, str) and operator_service:
        services = [operator_service]
    if not services:
        inferred = _SERVICE_BY_EVENT_TYPE.get(card.get("event_type_id"))
        if inferred is not None:
            services = [inferred]
    card["services"] = services

    statuses = card.get("service_statuses")
    if not isinstance(statuses, dict):
        statuses = {}
    default_status = "WORK_COMPLETED" if has_outbound_call else "ACCEPTED"
    card["service_statuses"] = {
        code: statuses.get(code, default_status) for code in services
    }
    return card


def _outbound_service_status_history(
    expected: dict[str, Any],
) -> dict[str, list[dict[str, str | None]]] | None:
    if expected.get("outbound_call") is None:
        return None
    card = expected.get("card")
    if not isinstance(card, dict):
        return None
    services = card.get("services")
    if not isinstance(services, list) or len(services) != 1:
        return None
    service_code = services[0]
    wording = _RESPONSE_UNIT_BY_SERVICE.get(service_code)
    if wording is None:
        return None
    unit, directed, departed, arrived, started = wording
    return {
        service_code: [
            {"status": "RECEIVED", "comment": None},
            {
                "status": "ACCEPTED",
                "comment": f"Карточка принята. {unit} {directed} к месту происшествия.",
            },
            {
                "status": "RESPONSE_STARTED",
                "comment": f"{unit} {departed} к месту происшествия.",
            },
            {
                "status": "ARRIVED",
                "comment": f"{unit} {arrived} по указанному адресу.",
            },
            {
                "status": "WORK_IN_PROGRESS",
                "comment": f"{unit} {started} к работе на месте.",
            },
            {
                "status": "WORK_COMPLETED",
                "comment": f"Работы службы {service_code} на месте происшествия завершены.",
            },
        ]
    }


def _normalize_container(container: dict[str, Any], location: str) -> bool:
    expected = container.get("expected_result")
    if not isinstance(expected, dict):
        return False

    changed = False
    rules = container.get("evaluation_rules")
    if not isinstance(rules, dict):
        rules = {}
    if "evaluation_rules" in container:
        container.pop("evaluation_rules", None)
        changed = True

    legacy = expected.pop("final_state", None)
    if legacy is not None:
        if not isinstance(legacy, dict):
            raise RuntimeError(f"Invalid expected_result.final_state at {location}")
        current = expected.get("card")
        if current is not None and not isinstance(current, dict):
            raise RuntimeError(f"Invalid expected_result.card at {location}")
        current = current or {}
        conflicting_fields = sorted(
            key
            for key in legacy.keys() & current.keys()
            if legacy[key] != current[key]
        )
        if conflicting_fields:
            raise RuntimeError(
                "Conflicting expected_result.card and final_state fields at "
                f"{location}: {', '.join(conflicting_fields)}"
            )
        initial = container.get("initial_card") or container.get("card_payload") or {}
        if not isinstance(initial, dict):
            raise RuntimeError(f"Invalid initial card at {location}")
        expected["card"] = _full_expected_card(
            initial,
            {**legacy, **current},
            rules,
            has_outbound_call=expected.get("outbound_call") is not None,
        )
        changed = True
    elif isinstance(expected.get("card"), dict):
        card = expected["card"]
        features = card.get("features")
        if isinstance(features, dict):
            for key in _REMOVED_FEATURE_COLUMNS:
                if key in features:
                    features.pop(key)
                    changed = True
    if "service_status_history" not in expected:
        expected["service_status_history"] = _outbound_service_status_history(expected)
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
    changed = _normalize_container(value, location)
    if "evaluation_rules" in value:
        value.pop("evaluation_rules", None)
        changed = True
    for key, child in list(value.items()):
        if key != "expected_result":
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


def _drop_foreign_keys_for_columns(table: str, columns: set[str]) -> None:
    for constraint in sa.inspect(op.get_bind()).get_foreign_keys(table):
        if columns.intersection(constraint["constrained_columns"]):
            op.drop_constraint(op.f(constraint["name"]), table, type_="foreignkey")


def _drop_checks_for_columns(table: str, columns: set[str]) -> None:
    for constraint in sa.inspect(op.get_bind()).get_check_constraints(table):
        sqltext = constraint.get("sqltext") or ""
        if any(column in sqltext for column in columns):
            op.drop_constraint(op.f(constraint["name"]), table, type_="check")


def upgrade() -> None:
    _rewrite_table("card_template", ("initial_card", "expected_result", "evaluation_rules"))
    _rewrite_table("incoming_call_template", ("expected_result",))
    _rewrite_table("training_scenario", ("definition",))
    _rewrite_table("scenario_assignment", ("scenario_snapshot",))
    _rewrite_table(
        "session_scheduled_card",
        ("card_payload", "expected_result", "evaluation_rules"),
    )
    _rewrite_table("training_call", ("expected_result",))

    op.drop_column("card_template", "evaluation_rules")
    op.drop_column("session_scheduled_card", "evaluation_rules")

    _drop_foreign_keys_for_columns("card_feature", _REMOVED_FEATURE_COLUMNS)
    _drop_checks_for_columns("card_feature", _REMOVED_FEATURE_COLUMNS)
    op.drop_index("ix_card_feature_classification", table_name="card_feature")
    for column in sorted(_REMOVED_FEATURE_COLUMNS):
        op.drop_column("card_feature", column)
        op.drop_column("card_feature_history", column)
    op.create_index(
        "ix_card_feature_classification",
        "card_feature",
        ["event_type_id", "event_kind_id"],
    )

    _drop_foreign_keys_for_columns("card_service_dispatch", {"routing_rule_id"})
    op.drop_column("card_service_dispatch", "routing_rule_id")

    op.drop_table("service_routing_rule")
    op.drop_table("third_order_feature")
    op.drop_table("second_order_feature")
    op.drop_table("first_order_feature")
    op.drop_table("incident_type")


def downgrade() -> None:
    raise RuntimeError(
        "Migration 0017 removes obsolete classifier structures and legacy JSON fields; "
        "restore a database backup to recover them"
    )
