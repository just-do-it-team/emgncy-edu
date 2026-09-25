import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.simulation_schemas import TrainingScenarioDetailResponse
from s112.domain.models import (
    CardTemplate,
    EmergencyService,
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
        service_codes.update(expected_card.get("services") or [])
        resolved.append((item, template, expected_card, initial_card))

    services = list(
        await session.scalars(
            select(EmergencyService).where(EmergencyService.code.in_(service_codes))
        )
    )
    services_by_code = {service.code: service for service in services}

    details = []
    for item, template, expected_card, initial_card in resolved:
        classification = expected_card.get("classification") or initial_card.get(
            "classification"
        )
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
                "classification": classification,
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
