from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.common.enums import TrainingActionResult, WorkspaceMemberRole
from s112.domain.models import (
    CardService,
    EmergencyService,
    IncidentCard,
    SessionScheduledCard,
    TrainingAction,
    WorkspaceMember,
)
from s112.semantic_evaluation.rules import (
    EVALUATION_RESULT_ACTION,
    LEGACY_CALL_ACTION,
    outbound_call_rule,
)


def _dict_contains(actual: dict[str, Any], expected: dict[str, Any]) -> bool:
    for key, value in expected.items():
        if key not in actual:
            return False
        if isinstance(value, dict):
            if not isinstance(actual[key], dict) or not _dict_contains(actual[key], value):
                return False
        elif actual[key] != value:
            return False
    return True


async def procedural_card_work_finished(
    session: AsyncSession, item: SessionScheduledCard
) -> bool:
    """Return whether the trainee finished the actions needed to leave this card."""

    if item.incident_card_id is None:
        return False
    card = await session.get(IncidentCard, item.incident_card_id)
    if card is None:
        return False

    expected = item.expected_result
    expected_card = expected.get("card")
    if expected_card is not None:
        expected_status = expected_card.get("current_status")
        if expected_status is not None and card.current_status != expected_status:
            return False

    actions = list(
        await session.scalars(
            select(TrainingAction)
            .where(
                TrainingAction.training_session_id == item.training_session_id,
                TrainingAction.incident_card_id == item.incident_card_id,
            )
            .order_by(TrainingAction.occurred_at)
        )
    )
    for required in expected.get("required_actions", []):
        if required["action_type"] == LEGACY_CALL_ACTION:
            continue
        if not any(
            action.action_type == required["action_type"]
            and action.result == TrainingActionResult.SUCCESS.value
            and _dict_contains(action.details, required.get("parameters", {}))
            for action in actions
        ):
            return False

    try:
        call_rule = outbound_call_rule(item.evaluation_rules, expected)
    except ValueError:
        return False
    if call_rule is not None and not any(
        action.action_type == EVALUATION_RESULT_ACTION for action in actions
    ):
        return False

    position_codes = set(
        await session.scalars(
            select(WorkspaceMember.position_code).where(
                WorkspaceMember.workspace_id == item.workspace_id,
                WorkspaceMember.member_role == WorkspaceMemberRole.PARTICIPANT.value,
                WorkspaceMember.left_at.is_(None),
                WorkspaceMember.position_code.is_not(None),
            )
        )
    )
    if position_codes:
        undecided_service = await session.scalar(
            select(CardService.id)
            .join(EmergencyService, EmergencyService.id == CardService.service_id)
            .where(
                CardService.card_id == item.incident_card_id,
                CardService.is_active.is_(True),
                EmergencyService.is_active.is_(True),
                EmergencyService.code.in_(position_codes),
                CardService.decided_at.is_(None),
            )
            .limit(1)
        )
        if undecided_service is not None:
            return False
    return True
