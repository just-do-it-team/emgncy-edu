from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.domain.models import (
    CardTemplate,
    IncomingCallTemplate,
    ScenarioAssignment,
    SessionScheduledCard,
    TrainingCall,
    TrainingSession,
    WorkspaceMember,
)


def _snapshot_template_id(assignment: ScenarioAssignment, item_key: str) -> uuid.UUID | None:
    cards = assignment.scenario_snapshot.get("definition", {}).get("cards", [])
    for item in cards:
        if item.get("key") == item_key and item.get("template_id"):
            return uuid.UUID(item["template_id"])
    return None


async def resolve_call_voice_id(
    session: AsyncSession, call: TrainingCall
) -> str | None:
    """Resolve a template voice without adding it to the scenario or call payload."""
    training_session = await session.get(TrainingSession, call.training_session_id)
    if training_session is None:
        return None
    assignment = await session.get(ScenarioAssignment, training_session.assignment_id)
    if assignment is None:
        return None

    if call.direction == "INBOUND":
        template_id = _snapshot_template_id(assignment, call.scenario_item_key)
        template = (
            await session.get(IncomingCallTemplate, template_id)
            if template_id is not None
            else None
        )
        return template.voice_id if template is not None else None

    if call.incident_card_id is None:
        return None
    scheduled_card = await session.scalar(
        select(SessionScheduledCard).where(
            SessionScheduledCard.incident_card_id == call.incident_card_id
        )
    )
    if scheduled_card is not None:
        template_id = scheduled_card.source_template_id or _snapshot_template_id(
            assignment, scheduled_card.scenario_card_key
        )
        template = (
            await session.get(CardTemplate, template_id)
            if template_id is not None
            else None
        )
        return template.voice_id if template is not None else None

    incoming_call = await session.scalar(
        select(TrainingCall).where(
            TrainingCall.incident_card_id == call.incident_card_id,
            TrainingCall.direction == "INBOUND",
        )
    )
    if incoming_call is None or call.operator_user_id is None:
        return None
    incoming_template_id = _snapshot_template_id(
        assignment, incoming_call.scenario_item_key
    )
    incoming_template = (
        await session.get(IncomingCallTemplate, incoming_template_id)
        if incoming_template_id is not None
        else None
    )
    if incoming_template is None or incoming_template.generation_id is None:
        return None
    member = await session.get(
        WorkspaceMember, (call.workspace_id, call.operator_user_id)
    )
    if member is None or member.position_code is None:
        return None
    paired_templates = await session.scalars(
        select(CardTemplate).where(
            CardTemplate.generation_id == incoming_template.generation_id
        )
    )
    for template in paired_templates:
        services = (template.expected_result.get("card") or {}).get("services") or []
        if member.position_code in services:
            return template.voice_id
    return None
