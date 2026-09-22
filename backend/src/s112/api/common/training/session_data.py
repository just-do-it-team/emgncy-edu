import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.dependencies import get_read_session
from s112.api.simulation_schemas import (
    ScheduledCardResponse,
    TrainingActionResponse,
    TrainingCallResponse,
)
from s112.domain.models import SessionScheduledCard, TrainingAction, TrainingCall


router = APIRouter(prefix="/api/v1", tags=["common/training"])


@router.get(
    "/training-sessions/{session_id}/actions",
    response_model=list[TrainingActionResponse],
)
async def list_training_actions(
    session_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> list[TrainingAction]:
    return list(
        await session.scalars(
            select(TrainingAction)
            .where(TrainingAction.training_session_id == session_id)
            .order_by(TrainingAction.occurred_at, TrainingAction.id)
        )
    )


@router.get(
    "/training-sessions/{session_id}/scheduled-cards",
    response_model=list[ScheduledCardResponse],
)
async def list_scheduled_cards(
    session_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> list[SessionScheduledCard]:
    return list(
        await session.scalars(
            select(SessionScheduledCard)
            .where(SessionScheduledCard.training_session_id == session_id)
            .order_by(
                SessionScheduledCard.scheduled_at,
                SessionScheduledCard.scenario_card_key,
            )
        )
    )


@router.get(
    "/training-sessions/{session_id}/incoming-calls",
    response_model=list[TrainingCallResponse],
)
async def list_incoming_calls(
    session_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> list[TrainingCall]:
    return list(
        await session.scalars(
            select(TrainingCall)
            .where(TrainingCall.training_session_id == session_id)
            .order_by(TrainingCall.scheduled_at, TrainingCall.scenario_item_key)
        )
    )
