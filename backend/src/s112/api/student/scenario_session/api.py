import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from s112.api.common.dependencies import (
    application_service,
    raise_http_error,
    simulation_service,
)
from s112.api.dependencies import get_read_session, get_write_session
from s112.api.schemas import (
    CardDecisionRequest,
    CardListItem,
    CardResponse,
    CardServiceResponse,
)
from s112.api.service import CardApplicationService, DomainError
from s112.api.simulation_schemas import (
    SessionCompleteRequest,
    SessionCompletionReadinessResponse,
    TrainingSessionResponse,
)
from s112.api.simulation_service import SimulationApplicationService
from s112.common.enums import WorkspaceMemberRole
from s112.domain.models import (
    CardListProjection,
    CardService,
    EmergencyService,
    IncidentCard,
    TrainingSession,
    WorkspaceMember,
)


router = APIRouter(prefix="/api/v1", tags=["student/scenario_session"])


@router.get(
    "/training-sessions/{session_id}/completion-readiness",
    response_model=SessionCompletionReadinessResponse,
)
async def get_completion_readiness(
    session_id: uuid.UUID,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> dict:
    try:
        return await service.completion.get_for_user(session, session_id, user_id)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/training-sessions/{session_id}/complete",
    response_model=TrainingSessionResponse,
)
async def complete_training_session(
    session_id: uuid.UUID,
    request: SessionCompleteRequest,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingSession:
    try:
        async with session.begin():
            return await service.complete_session(session, session_id, request.user_id)
    except DomainError as exc:
        raise_http_error(exc)


@router.get(
    "/workspaces/{workspace_id}/cards",
    response_model=list[CardListItem],
)
async def list_workspace_cards(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_read_session),
) -> list[CardListProjection]:
    member = await session.get(WorkspaceMember, (workspace_id, user_id))
    if member is None or member.left_at is not None:
        raise HTTPException(status_code=403, detail="Workspace access denied")
    statement = select(CardListProjection).where(
        CardListProjection.workspace_id == workspace_id
    )
    if (
        member.member_role == WorkspaceMemberRole.PARTICIPANT.value
        and member.position_code
    ):
        statement = (
            statement.join(
                CardService, CardService.card_id == CardListProjection.card_id
            )
            .join(EmergencyService, EmergencyService.id == CardService.service_id)
            .where(
                CardService.is_active.is_(True),
                EmergencyService.code == member.position_code,
                EmergencyService.is_active.is_(True),
            )
            .distinct()
        )
    return list(
        await session.scalars(
            statement.order_by(CardListProjection.registered_at.desc()).limit(limit)
        )
    )


@router.get(
    "/workspaces/{workspace_id}/cards/{card_id}",
    response_model=CardResponse,
)
async def get_workspace_card(
    workspace_id: uuid.UUID,
    card_id: uuid.UUID,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> IncidentCard:
    member = await session.get(WorkspaceMember, (workspace_id, user_id))
    if member is None or member.left_at is not None:
        raise HTTPException(status_code=403, detail="Workspace access denied")
    filters = [
        IncidentCard.id == card_id,
        IncidentCard.workspace_id == workspace_id,
    ]
    if (
        member.member_role == WorkspaceMemberRole.PARTICIPANT.value
        and member.position_code
    ):
        filters.append(
            select(CardService.id)
            .join(EmergencyService, EmergencyService.id == CardService.service_id)
            .where(
                CardService.card_id == IncidentCard.id,
                CardService.is_active.is_(True),
                EmergencyService.code == member.position_code,
                EmergencyService.is_active.is_(True),
            )
            .exists()
        )
    card = await session.scalar(
        select(IncidentCard)
        .options(
            selectinload(IncidentCard.features),
            selectinload(IncidentCard.services),
        )
        .where(*filters)
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@router.post(
    "/workspaces/{workspace_id}/cards/{card_id}/open",
    response_model=CardServiceResponse,
)
async def open_workspace_card(
    workspace_id: uuid.UUID,
    card_id: uuid.UUID,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> CardService:
    try:
        async with session.begin():
            return await service.open_card_for_operator(
                session, workspace_id, card_id, user_id
            )
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/workspaces/{workspace_id}/cards/{card_id}/decision",
    response_model=CardServiceResponse,
)
async def decide_workspace_card(
    workspace_id: uuid.UUID,
    card_id: uuid.UUID,
    body: CardDecisionRequest,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> CardService:
    try:
        async with session.begin():
            return await service.decide_card_for_operator(
                session,
                workspace_id,
                card_id,
                user_id,
                body.decision,
                comment=body.comment,
                request_id=body.request_id,
            )
    except DomainError as exc:
        raise_http_error(exc)
