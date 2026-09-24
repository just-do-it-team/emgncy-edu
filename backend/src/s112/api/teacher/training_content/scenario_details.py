import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.service import CardApplicationService
from s112.api.simulation_schemas import TrainingScenarioDetailResponse
from s112.domain.models import (
    CardTemplate,
    EmergencyService,
    EventKind,
    EventType,
    FirstOrderFeature,
    IncidentType,
    IncomingCallTemplate,
    SecondOrderFeature,
    ServiceRoutingRule,
    ThirdOrderFeature,
    TrainingScenario,
)


async def scenario_detail_response(
    session: AsyncSession, scenario: TrainingScenario
) -> TrainingScenarioDetailResponse:
    raw_items = scenario.definition.get("cards", [])
    card_template_ids = {
        uuid.UUID(item["template_id"])
        for item in raw_items
        if item.get("source_type") == "TEMPLATE"
        and item.get("item_type") == "INCIDENT_CARD"
    }
    call_template_ids = {
        uuid.UUID(item["template_id"])
        for item in raw_items
        if item.get("source_type") == "TEMPLATE"
        and item.get("item_type") == "INCOMING_CALL"
    }
    card_templates = {
        item.id: item
        for item in await session.scalars(
            select(CardTemplate).where(CardTemplate.id.in_(card_template_ids))
        )
    }
    call_templates = {
        item.id: item
        for item in await session.scalars(
            select(IncomingCallTemplate).where(IncomingCallTemplate.id.in_(call_template_ids))
        )
    }

    resolved: list[tuple[dict[str, Any], Any, dict[str, Any], dict[str, Any]]] = []
    event_type_ids: set[int] = set()
    feature_ids: dict[str, set[int]] = defaultdict(set)
    service_codes: set[str] = set()
    incident_type_ids: set[uuid.UUID] = set()
    for item in raw_items:
        template_id = item.get("template_id")
        template = None
        if item.get("source_type") == "TEMPLATE" and template_id:
            templates = (
                call_templates
                if item.get("item_type") == "INCOMING_CALL"
                else card_templates
            )
            template = templates.get(uuid.UUID(template_id))
        expected = item.get("expected_result") or (
            template.expected_result if template is not None else {}
        )
        initial_card = item.get("initial_card") or (
            template.initial_card if isinstance(template, CardTemplate) else {}
        )
        expected_card = expected.get("card") or expected.get("final_state") or {}
        event_type_id = expected_card.get("event_type_id") or initial_card.get("event_type_id")
        if event_type_id is not None:
            event_type_ids.add(event_type_id)
        features = expected_card.get("features") or initial_card.get("features") or {}
        for key in (
            "event_kind_id",
            "first_order_feature_id",
            "second_order_feature_id",
            "third_order_feature_id",
        ):
            if features.get(key) is not None:
                feature_ids[key].add(features[key])
        service_codes.update(expected_card.get("services") or [])
        incident_type_id = features.get("incident_type_id")
        if incident_type_id:
            incident_type_ids.add(uuid.UUID(str(incident_type_id)))
        resolved.append((item, template, expected_card, initial_card))

    event_types = {
        row.id: row
        for row in await session.scalars(
            select(EventType).where(EventType.id.in_(event_type_ids))
        )
    }
    feature_models = (
        ("event_kind_id", EventKind),
        ("first_order_feature_id", FirstOrderFeature),
        ("second_order_feature_id", SecondOrderFeature),
        ("third_order_feature_id", ThirdOrderFeature),
    )
    feature_rows: dict[str, dict[int, Any]] = {}
    for key, model in feature_models:
        feature_rows[key] = {
            row.id: row
            for row in await session.scalars(
                select(model).where(model.id.in_(feature_ids[key]))
            )
        }
    incident_types = {
        row.id: row
        for row in await session.scalars(
            select(IncidentType).where(IncidentType.id.in_(incident_type_ids))
        )
    }
    routing_rules = list(
        await session.scalars(
            select(ServiceRoutingRule)
            .where(
                ServiceRoutingRule.event_kind_id.in_(feature_ids["event_kind_id"]),
                ServiceRoutingRule.is_active.is_(True),
            )
            .order_by(ServiceRoutingRule.sort_order, ServiceRoutingRule.route_code)
        )
    )
    rules_by_kind: dict[int, list[ServiceRoutingRule]] = defaultdict(list)
    for rule in routing_rules:
        rules_by_kind[rule.event_kind_id].append(rule)
    routing_service_ids = {rule.service_id for rule in routing_rules}
    services = list(
        await session.scalars(
            select(EmergencyService).where(
                or_(
                    EmergencyService.id.in_(routing_service_ids),
                    EmergencyService.code.in_(service_codes),
                )
            )
        )
    )
    services_by_id = {service.id: service for service in services}
    services_by_code = {service.code: service for service in services}

    details = []
    for item, template, expected_card, initial_card in resolved:
        features = expected_card.get("features") or initial_card.get("features") or {}
        event_type_id = expected_card.get("event_type_id") or initial_card.get("event_type_id")
        event_type = event_types.get(event_type_id)
        event_kind_id = features.get("event_kind_id")
        event_kind = feature_rows["event_kind_id"].get(event_kind_id)
        selected_features = []
        for level, key in enumerate(
            (
                "first_order_feature_id",
                "second_order_feature_id",
                "third_order_feature_id",
            ),
            start=1,
        ):
            feature_id = features.get(key)
            if feature_id is not None:
                feature = feature_rows[key].get(feature_id)
                selected_features.append(
                    {
                        "level": level,
                        "feature_id": feature_id,
                        "code": feature.code if feature else None,
                        "name": feature.name if feature else None,
                    }
                )
        matched_rules = [
            rule
            for rule in rules_by_kind.get(event_kind_id, [])
            if CardApplicationService._condition_matches(
                rule.condition, features.get("additional_features") or {}
            )
        ]
        notification_list = []
        seen_service_ids: set[uuid.UUID] = set()
        for rule in matched_rules:
            if rule.service_id in seen_service_ids:
                continue
            seen_service_ids.add(rule.service_id)
            service = services_by_id.get(rule.service_id)
            if service is None:
                continue
            notification_list.append(
                {
                    "service_id": service.id,
                    "code": service.code,
                    "name": service.name,
                    "is_main": any(
                        candidate.service_id == service.id and candidate.is_primary
                        for candidate in matched_rules
                    ),
                }
            )
        if not notification_list:
            for code in expected_card.get("services") or []:
                service = services_by_code.get(code)
                notification_list.append(
                    {
                        "service_id": service.id if service else None,
                        "code": code,
                        "name": service.name if service else None,
                        "is_main": False,
                    }
                )
        primary_services = [entry for entry in notification_list if entry["is_main"]]
        incident_type_id = features.get("incident_type_id")
        incident_type = (
            incident_types.get(uuid.UUID(str(incident_type_id)))
            if incident_type_id else None
        )
        details.append(
            {
                "key": item["key"],
                "item_type": item["item_type"],
                "source_type": item["source_type"],
                "template_id": item.get("template_id"),
                "template_name": template.name if template else None,
                "initial_card": initial_card or None,
                "initial_call": item.get("initial_call") or (
                    template.initial_call
                    if isinstance(template, IncomingCallTemplate) else None
                ),
                "expected_card": expected_card or None,
                "event_type_name": event_type.name if event_type else None,
                "event_kind_name": event_kind.name if event_kind else None,
                "incident_type_name": incident_type.name if incident_type else None,
                "ekp35_incident_type": incident_type.ekp_name if incident_type else None,
                "features": selected_features,
                "main_service": (
                    primary_services[0] if len(primary_services) == 1 else None
                ),
                "notification_list": notification_list,
            }
        )

    return TrainingScenarioDetailResponse.model_validate(
        {
            **TrainingScenarioDetailResponse.model_validate(scenario).model_dump(),
            "items": details,
        }
    )
