import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from s112.api.common.dependencies import (
    application_service,
    raise_http_error,
    record_rejected_card_action,
    record_rejected_service_action,
)
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
from s112.domain.models import (
    CardFeature,
    CardFeatureHistory,
    CardListProjection,
    CardService,
    CardStatusHistory,
    IncidentCard,
    ServiceStatusHistory,
)


router = APIRouter(prefix="/api/v1", tags=["common/cards"])


@router.post("/cards", response_model=CardResponse, status_code=status.HTTP_201_CREATED)
async def create_card(
    request: CardCreate,
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> IncidentCard:
    try:
        async with session.begin():
            card = await service.create_card(session, request)
        await session.refresh(card, attribute_names=["features", "services"])
        return card
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/cards", response_model=list[CardListItem])
async def list_cards(
    card_status: str | None = Query(default=None, alias="status"),
    event_type_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_read_session),
) -> list[CardListProjection]:
    statement = select(CardListProjection)
    if card_status:
        statement = statement.where(CardListProjection.current_status == card_status)
    if event_type_id is not None:
        statement = statement.where(CardListProjection.event_type_id == event_type_id)
    statement = statement.order_by(CardListProjection.registered_at.desc()).limit(limit)
    return list(await session.scalars(statement))


@router.get("/cards/{card_id}", response_model=CardResponse)
async def get_card(
    card_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> IncidentCard:
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
    session: AsyncSession = Depends(get_read_session),
) -> list[CardFeatureHistory]:
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
    session: AsyncSession = Depends(get_read_session),
) -> list[CardStatusHistory]:
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
    session: AsyncSession = Depends(get_read_session),
) -> list[CardService]:
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
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> IncidentCard:
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
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> CardFeature:
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
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> IncidentCard:
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
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> CardService:
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
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> ServiceStatusResponse:
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
    session: AsyncSession = Depends(get_read_session),
) -> list[ServiceStatusHistory]:
    return list(
        await session.scalars(
            select(ServiceStatusHistory)
            .where(ServiceStatusHistory.card_service_id == card_service_id)
            .order_by(ServiceStatusHistory.occurred_at)
        )
    )
