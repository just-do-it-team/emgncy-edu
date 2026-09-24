from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.domain.models import (
    CardFeature,
    CardService,
    EmergencyService,
    IncidentCard,
    SessionScheduledCard,
    TrainingAction,
)
from s112.semantic_evaluation.rules import EVALUATION_RESULT_ACTION, outbound_call_rule


def _dict_contains(actual: dict[str, Any], expected: dict[str, Any]) -> bool:
    for key, value in expected.items():
        if key not in actual:
            return False
        if isinstance(value, dict):
            if not isinstance(actual[key], dict) or not _dict_contains(actual[key], value):
                return False
        elif key == "services" and isinstance(value, list):
            if sorted(actual[key]) != sorted(value):
                return False
        elif actual[key] != value:
            return False
    return True


async def procedural_card_work_finished(
    session: AsyncSession, item: SessionScheduledCard
) -> bool:
    """Return whether the card has reached its expected state."""

    if item.incident_card_id is None:
        return False
    card = await session.get(IncidentCard, item.incident_card_id)
    if card is None:
        return False

    expected = item.expected_result
    expected_card = expected.get("card") or expected.get("final_state", {})
    state: dict[str, Any] = {
        "event_type_id": card.event_type_id,
        "description": card.description,
        "questionnaire": card.questionnaire,
        "applicant_full_name": card.applicant_full_name,
        "reported_address": card.reported_address,
        "incident_address": card.incident_address,
        "victims_count": card.victims_count,
        "current_status": card.current_status,
    }
    if "features" in expected_card:
        feature = await session.get(CardFeature, card.id)
        state["features"] = (
            {
                "event_kind_id": feature.event_kind_id,
                "first_order_feature_id": feature.first_order_feature_id,
                "second_order_feature_id": feature.second_order_feature_id,
                "third_order_feature_id": feature.third_order_feature_id,
                "additional_features": feature.additional_features,
            }
            if feature is not None
            else None
        )
    if "services" in expected_card or "service_statuses" in expected_card:
        service_rows = (
            await session.execute(
                select(CardService, EmergencyService)
                .join(EmergencyService, EmergencyService.id == CardService.service_id)
                .where(CardService.card_id == card.id, CardService.is_active.is_(True))
            )
        ).all()
        state["services"] = [service.code for _, service in service_rows]
        state["service_statuses"] = {
            service.code: card_service.current_status
            for card_service, service in service_rows
        }
    if not _dict_contains(state, expected_card):
        return False

    try:
        call_rule = outbound_call_rule(item.evaluation_rules, expected)
    except ValueError:
        return False
    if call_rule is None:
        return True
    evaluated = await session.scalar(
        select(TrainingAction.id)
        .where(
            TrainingAction.training_session_id == item.training_session_id,
            TrainingAction.incident_card_id == item.incident_card_id,
            TrainingAction.action_type == EVALUATION_RESULT_ACTION,
        )
        .limit(1)
    )
    return evaluated is not None
