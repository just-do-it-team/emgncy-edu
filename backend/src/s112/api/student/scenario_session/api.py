import base64
import binascii
import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import and_, or_, select
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
    CardListPage,
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


def _assert_request_identity(request: Request, user_id: uuid.UUID) -> None:
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, "principal", None)
        if principal is None or principal.user_id != user_id:
            raise HTTPException(status_code=403, detail="User does not match token")


def _encode_cards_cursor(card: CardListProjection) -> str:
    payload = json.dumps(
        {
            "registered_at": card.registered_at.isoformat(),
            "card_id": str(card.card_id),
        },
        separators=(",", ":"),
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _decode_cards_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        padding = "=" * (-len(cursor) % 4)
        raw = base64.b64decode(
            (cursor + padding).encode("ascii"), altchars=b"-_", validate=True
        )
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError
        registered_at = datetime.fromisoformat(payload["registered_at"])
        card_id = uuid.UUID(payload["card_id"])
    except (
        binascii.Error,
        KeyError,
        TypeError,
        ValueError,
        UnicodeError,
    ):
        raise HTTPException(status_code=422, detail="Invalid cards cursor") from None
    return registered_at, card_id


@router.get(
    "/training-sessions/{session_id}/completion-readiness",
    response_model=SessionCompletionReadinessResponse,
)
async def get_completion_readiness(
    session_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> dict:
    _assert_request_identity(request, user_id)
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
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingSession:
    _assert_request_identity(http_request, request.user_id)
    try:
        async with session.begin():
            return await service.complete_session(session, session_id, request.user_id)
    except DomainError as exc:
        raise_http_error(exc)


@router.get(
    "/workspaces/{workspace_id}/cards",
    response_model=CardListPage,
)
async def list_workspace_cards(
    workspace_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    limit: int = Query(default=100, ge=1, le=500),
    cursor: str | None = Query(default=None, max_length=1024),
    session: AsyncSession = Depends(get_read_session),
) -> CardListPage:
    _assert_request_identity(request, user_id)
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
    if cursor is not None:
        registered_at, card_id = _decode_cards_cursor(cursor)
        statement = statement.where(
            or_(
                CardListProjection.registered_at < registered_at,
                and_(
                    CardListProjection.registered_at == registered_at,
                    CardListProjection.card_id < card_id,
                ),
            )
        )
    rows = list(
        await session.scalars(
            statement.order_by(
                CardListProjection.registered_at.desc(),
                CardListProjection.card_id.desc(),
            ).limit(limit + 1)
        )
    )
    items = rows[:limit]
    next_cursor = _encode_cards_cursor(items[-1]) if len(rows) > limit else None
    return CardListPage(items=items, next_cursor=next_cursor)


@router.get(
    "/workspaces/{workspace_id}/cards/{card_id}",
    response_model=CardResponse,
)
async def get_workspace_card(
    workspace_id: uuid.UUID,
    card_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> IncidentCard:
    _assert_request_identity(request, user_id)
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
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> CardService:
    _assert_request_identity(request, user_id)
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
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> CardService:
    _assert_request_identity(request, user_id)
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
