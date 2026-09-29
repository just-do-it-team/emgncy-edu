import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from s112.api.common.dependencies import (
    application_service,
    raise_http_error,
    record_rejected_card_action,
    record_rejected_service_action,
)
from s112.api.identity import with_optional_acting_user
from s112.api.dependencies import get_read_session, get_write_session
from s112.api.schemas import (
    CardCreate,
    CardFeatureHistoryResponse,
    CardFeatureResponse,
    CardFeatureUpdate,
    CardListItem,
    CardResponse,
    CardServiceCreate,
    CardServiceResponse,
    CardStatusCreate,
    CardStatusHistoryResponse,
    CardUpdate,
    ServiceStatusCreate,
    ServiceStatusResponse,
)
from s112.api.service import CardApplicationService, DomainError
from s112.common.enums import WorkspaceMemberRole
from s112.domain.models import (
    CardFeature,
    CardFeatureHistory,
    CardListProjection,
    CardService,
    CardStatusHistory,
    IncidentCard,
    ServiceStatusHistory,
    SimulationWorkspace,
    WorkspaceMember,
    EmergencyService,
)


router = APIRouter(prefix="/api/v1", tags=["common/cards"])


async def _assert_card_read_access(
    http_request: Request, session: AsyncSession, card_id: uuid.UUID
) -> None:
    if not http_request.app.state.auth_settings.enabled:
        return
    principal = getattr(http_request.state, "principal", None)
    card = await session.get(IncidentCard, card_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    workspace = await session.get(SimulationWorkspace, card.workspace_id)
    if workspace is None or workspace.training_session_id is None:
        return
    member = await session.get(WorkspaceMember, (workspace.id, principal.user_id))
    if member is None or member.left_at is not None:
        raise HTTPException(status_code=404, detail="Card not found")
    if (
        member.member_role == WorkspaceMemberRole.PARTICIPANT.value
        and member.position_code is not None
    ):
        notified = await session.scalar(
            select(CardService.id)
            .join(EmergencyService, EmergencyService.id == CardService.service_id)
            .where(
                CardService.card_id == card_id,
                CardService.is_active.is_(True),
                EmergencyService.code == member.position_code,
                EmergencyService.is_active.is_(True),
            )
            .limit(1)
        )
        if notified is None:
            raise HTTPException(status_code=404, detail="Card not found")


@router.post("/cards", response_model=CardResponse, status_code=status.HTTP_201_CREATED)
async def create_card(
    request: CardCreate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> IncidentCard:
    request = with_optional_acting_user(http_request, request, "operator_id")
    try:
        async with session.begin():
            card = await service.create_card(session, request)
        await session.refresh(card, attribute_names=["features", "services"])
        return card
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/cards", response_model=list[CardListItem])
async def list_cards(
    http_request: Request,
    card_status: str | None = Query(default=None, alias="status"),
    event_type_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_read_session),
) -> list[CardListProjection]:
    statement = select(CardListProjection)
    if http_request.app.state.auth_settings.enabled:
        principal = http_request.state.principal
        routed_to_member = (
            select(CardService.id)
            .join(EmergencyService, EmergencyService.id == CardService.service_id)
            .where(
                CardService.card_id == CardListProjection.card_id,
                CardService.is_active.is_(True),
                EmergencyService.code == WorkspaceMember.position_code,
                EmergencyService.is_active.is_(True),
            )
            .exists()
        )
        statement = (
            statement.join(
                SimulationWorkspace,
                SimulationWorkspace.id == CardListProjection.workspace_id,
            )
            .outerjoin(
                WorkspaceMember,
                and_(
                    WorkspaceMember.workspace_id == SimulationWorkspace.id,
                    WorkspaceMember.user_id == principal.user_id,
                ),
            )
            .where(
                or_(
                    SimulationWorkspace.training_session_id.is_(None),
                    and_(
                        WorkspaceMember.user_id.is_not(None),
                        WorkspaceMember.left_at.is_(None),
                        or_(
                            WorkspaceMember.member_role
                            != WorkspaceMemberRole.PARTICIPANT.value,
                            WorkspaceMember.position_code.is_(None),
                            routed_to_member,
                        ),
                    ),
                )
            )
        )
    if card_status:
        statement = statement.where(CardListProjection.current_status == card_status)
    if event_type_id is not None:
        statement = statement.where(CardListProjection.event_type_id == event_type_id)
    statement = statement.order_by(CardListProjection.registered_at.desc()).limit(limit)
    return list(await session.scalars(statement))


@router.get("/cards/{card_id}", response_model=CardResponse)
async def get_card(
    card_id: uuid.UUID,
    http_request: Request,
    session: AsyncSession = Depends(get_read_session),
) -> IncidentCard:
    await _assert_card_read_access(http_request, session, card_id)
    card = await session.scalar(
        select(IncidentCard)
        .options(
            selectinload(IncidentCard.features),
            selectinload(IncidentCard.services),
        )
        .where(IncidentCard.id == card_id)
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@router.get(
    "/cards/{card_id}/feature-history",
    response_model=list[CardFeatureHistoryResponse],
)
async def get_card_feature_history(
    card_id: uuid.UUID,
    http_request: Request,
    session: AsyncSession = Depends(get_read_session),
) -> list[CardFeatureHistory]:
    await _assert_card_read_access(http_request, session, card_id)
    return list(
        await session.scalars(
            select(CardFeatureHistory)
            .where(CardFeatureHistory.card_id == card_id)
            .order_by(CardFeatureHistory.revision)
        )
    )


@router.get(
    "/cards/{card_id}/status-history",
    response_model=list[CardStatusHistoryResponse],
)
async def get_card_status_history(
    card_id: uuid.UUID,
    http_request: Request,
    session: AsyncSession = Depends(get_read_session),
) -> list[CardStatusHistory]:
    await _assert_card_read_access(http_request, session, card_id)
    return list(
        await session.scalars(
            select(CardStatusHistory)
            .where(CardStatusHistory.card_id == card_id)
            .order_by(CardStatusHistory.set_at)
        )
    )


@router.get(
    "/cards/{card_id}/services",
    response_model=list[CardServiceResponse],
)
async def get_card_services(
    card_id: uuid.UUID,
    http_request: Request,
    session: AsyncSession = Depends(get_read_session),
) -> list[CardService]:
    await _assert_card_read_access(http_request, session, card_id)
    return list(
        await session.scalars(
            select(CardService)
            .where(CardService.card_id == card_id)
            .order_by(CardService.added_at)
        )
    )


@router.patch("/cards/{card_id}", response_model=CardResponse)
async def update_card(
    card_id: uuid.UUID,
    request: CardUpdate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> IncidentCard:
    request = with_optional_acting_user(http_request, request, "actor_id")
    try:
        async with session.begin():
            card = await service.update_card(session, card_id, request)
        await session.refresh(card, attribute_names=["features", "services"])
        return card
    except DomainError as exc:
        await record_rejected_card_action(
            session,
            service,
            card_id,
            actor_id=request.actor_id,
            action_type="CARD_UPDATED",
            request_id=request.request_id,
            error=exc,
        )
        raise_http_error(exc)


@router.put("/cards/{card_id}/features", response_model=CardFeatureResponse)
async def update_card_features(
    card_id: uuid.UUID,
    request: CardFeatureUpdate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> CardFeature:
    request = with_optional_acting_user(http_request, request, "actor_id")
    try:
        async with session.begin():
            return await service.update_features(session, card_id, request)
    except DomainError as exc:
        await record_rejected_card_action(
            session,
            service,
            card_id,
            actor_id=request.actor_id,
            action_type="CARD_FEATURES_UPDATED",
            request_id=request.request_id,
            error=exc,
        )
        raise_http_error(exc)


@router.post("/cards/{card_id}/statuses", response_model=CardResponse)
async def set_card_status(
    card_id: uuid.UUID,
    request: CardStatusCreate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> IncidentCard:
    request = with_optional_acting_user(http_request, request, "actor_id")
    try:
        async with session.begin():
            card = await service.set_card_status(session, card_id, request)
        await session.refresh(card, attribute_names=["features", "services"])
        return card
    except DomainError as exc:
        await record_rejected_card_action(
            session,
            service,
            card_id,
            actor_id=request.actor_id,
            action_type="CARD_STATUS_CHANGED",
            request_id=request.request_id,
            error=exc,
        )
        raise_http_error(exc)


@router.post(
    "/cards/{card_id}/services",
    response_model=CardServiceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_card_service(
    card_id: uuid.UUID,
    request: CardServiceCreate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> CardService:
    request = with_optional_acting_user(http_request, request, "actor_id")
    try:
        async with session.begin():
            return await service.add_service(session, card_id, request)
    except DomainError as exc:
        await record_rejected_card_action(
            session,
            service,
            card_id,
            actor_id=request.actor_id,
            action_type="CARD_SERVICE_ADDED",
            request_id=request.request_id,
            error=exc,
        )
        raise_http_error(exc)


@router.post(
    "/card-services/{card_service_id}/statuses",
    response_model=ServiceStatusResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_service_status(
    card_service_id: uuid.UUID,
    request: ServiceStatusCreate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> ServiceStatusResponse:
    request = with_optional_acting_user(http_request, request, "author_id")
    try:
        async with session.begin():
            result = await service.add_service_status(session, card_service_id, request)
        return ServiceStatusResponse.model_validate(result)
    except DomainError as exc:
        await record_rejected_service_action(
            session,
            service,
            card_service_id,
            actor_id=request.author_id,
            request_id=request.request_id,
            error=exc,
        )
        raise_http_error(exc)


@router.get(
    "/card-services/{card_service_id}/status-history",
    response_model=list[ServiceStatusResponse],
)
async def get_service_status_history(
    card_service_id: uuid.UUID,
    http_request: Request,
    session: AsyncSession = Depends(get_read_session),
) -> list[ServiceStatusHistory]:
    if http_request.app.state.auth_settings.enabled:
        card_id = await session.scalar(
            select(CardService.card_id).where(CardService.id == card_service_id)
        )
        if card_id is None:
            raise HTTPException(status_code=404, detail="Card service not found")
        await _assert_card_read_access(http_request, session, card_id)
    return list(
        await session.scalars(
            select(ServiceStatusHistory)
            .where(ServiceStatusHistory.card_service_id == card_service_id)
            .order_by(ServiceStatusHistory.occurred_at)
        )
    )
