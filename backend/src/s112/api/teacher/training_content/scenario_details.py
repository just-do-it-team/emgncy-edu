import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.simulation_schemas import TrainingScenarioDetailResponse
from s112.domain.models import (
    CardTemplate,
    EmergencyService,
    EventKind,
    EventType,
    IncomingCallTemplate,
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
    event_kind_ids: set[int] = set()
    service_codes: set[str] = set()
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
        expected_card = expected.get("card") or {}
        event_type_id = expected_card.get("event_type_id") or initial_card.get("event_type_id")
        if event_type_id is not None:
            event_type_ids.add(event_type_id)
        features = {
            **(initial_card.get("features") or {}),
            **(expected_card.get("features") or {}),
        }
        if features.get("event_kind_id") is not None:
            event_kind_ids.add(features["event_kind_id"])
        service_codes.update(expected_card.get("services") or [])
        resolved.append((item, template, expected_card, initial_card))

    event_types = {
        row.id: row
        for row in await session.scalars(
            select(EventType).where(EventType.id.in_(event_type_ids))
        )
    }
    event_kinds = {
        row.id: row
        for row in await session.scalars(
            select(EventKind).where(EventKind.id.in_(event_kind_ids))
        )
    }
    services = list(
        await session.scalars(
            select(EmergencyService).where(EmergencyService.code.in_(service_codes))
        )
    )
    services_by_code = {service.code: service for service in services}

    details = []
    for item, template, expected_card, initial_card in resolved:
        features = {
            **(initial_card.get("features") or {}),
            **(expected_card.get("features") or {}),
        }
        event_type_id = expected_card.get("event_type_id") or initial_card.get("event_type_id")
        event_type = event_types.get(event_type_id)
        event_kind_id = features.get("event_kind_id")
        event_kind = event_kinds.get(event_kind_id)
        notification_list = []
        for index, code in enumerate(expected_card.get("services") or []):
            service = services_by_code.get(code)
            notification_list.append(
                {
                    "service_id": service.id if service else None,
                    "code": code,
                    "name": service.name if service else None,
                    "is_main": index == 0,
                }
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
                "main_service": notification_list[0] if notification_list else None,
                "notification_list": notification_list,
            }
        )

    return TrainingScenarioDetailResponse.model_validate(
        {
            **TrainingScenarioDetailResponse.model_validate(scenario).model_dump(),
            "items": details,
        }
    )
