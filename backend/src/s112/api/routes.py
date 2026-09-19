import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from s112.api.dependencies import get_read_session, get_write_session
from s112.api.schemas import (
    CardCreate,
    CardFeatureResponse,
    CardFeatureHistoryResponse,
    CardFeatureUpdate,
    CardListItem,
    CardResponse,
    CardServiceCreate,
    CardServiceResponse,
    CardStatusCreate,
    CardStatusHistoryResponse,
    CardUpdate,
    ClassificationResolutionResponse,
    EmergencyServiceCreate,
    EmergencyServiceResponse,
    EventKindResponse,
    EventTypeResponse,
    FeatureOptionCreate,
    FeatureOptionResponse,
    HealthResponse,
    ServiceStatusCreate,
    ServiceStatusResponse,
)
from s112.api.service import (
    CardApplicationService,
    ConflictError,
    DomainError,
    NotFoundError,
    ValidationError,
)
from s112.domain.models import (
    CardListProjection,
    CardFeature,
    CardFeatureHistory,
    CardService,
    CardStatusHistory,
    EmergencyService,
    EventKind,
    EventType,
    FeatureSchema,
    FirstOrderFeature,
    IncidentCard,
    IncidentType,
    SecondOrderFeature,
    ServiceStatusHistory,
    ThirdOrderFeature,
)


router = APIRouter()


def application_service(request: Request) -> CardApplicationService:
    return CardApplicationService(request.app.state.settings.kafka_topic)


def raise_http_error(exc: DomainError) -> None:
    if isinstance(exc, NotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, ConflictError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, ValidationError):
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    raise HTTPException(status_code=400, detail=str(exc)) from exc


async def record_rejected_card_action(
    session: AsyncSession,
    service: CardApplicationService,
    card_id: uuid.UUID,
    *,
    actor_id: uuid.UUID | None,
    action_type: str,
    request_id: str | None,
    error: DomainError,
) -> None:
    try:
        async with session.begin():
            await service.record_rejected_card_action(
                session,
                card_id,
                actor_id=actor_id,
                action_type=action_type,
                request_id=request_id,
                error=str(error),
            )
    except Exception:
        await session.rollback()


async def record_rejected_service_action(
    session: AsyncSession,
    service: CardApplicationService,
    card_service_id: uuid.UUID,
    *,
    actor_id: uuid.UUID | None,
    request_id: str | None,
    error: DomainError,
) -> None:
    try:
        async with session.begin():
            await service.record_rejected_service_action(
                session,
                card_service_id,
                actor_id=actor_id,
                request_id=request_id,
                error=str(error),
            )
    except Exception:
        await session.rollback()


@router.get("/health", response_model=HealthResponse)
async def health(session: AsyncSession = Depends(get_write_session)) -> HealthResponse:
    await session.execute(text("SELECT 1"))
    return HealthResponse(status="ok", service="card-api")


@router.get("/api/v1/event-types", response_model=list[EventTypeResponse])
async def list_event_types(
    session: AsyncSession = Depends(get_read_session),
) -> list[EventType]:
    return list(
        await session.scalars(
            select(EventType).where(EventType.is_active.is_(True)).order_by(EventType.sort_order)
        )
    )


@router.get(
    "/api/v1/event-types/{event_type_id}/event-kinds",
    response_model=list[EventKindResponse],
)
async def list_event_kinds(
    event_type_id: int,
    session: AsyncSession = Depends(get_read_session),
) -> list[EventKind]:
    return list(
        await session.scalars(
            select(EventKind)
            .where(EventKind.event_type_id == event_type_id, EventKind.is_active.is_(True))
            .order_by(EventKind.sort_order)
        )
    )


@router.get(
    "/api/v1/event-kinds/{event_kind_id}/first-order-features",
    response_model=list[FeatureOptionResponse],
)
async def list_first_order_features(
    event_kind_id: int,
    session: AsyncSession = Depends(get_read_session),
) -> list[FirstOrderFeature]:
    return list(
        await session.scalars(
            select(FirstOrderFeature)
            .where(
                FirstOrderFeature.event_kind_id == event_kind_id,
                FirstOrderFeature.is_active.is_(True),
            )
            .order_by(FirstOrderFeature.sort_order)
        )
    )


@router.post(
    "/api/v1/event-kinds/{event_kind_id}/first-order-features",
    response_model=FeatureOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_first_order_feature(
    event_kind_id: int,
    request: FeatureOptionCreate,
    session: AsyncSession = Depends(get_write_session),
) -> FirstOrderFeature:
    async with session.begin():
        if await session.get(EventKind, event_kind_id) is None:
            raise HTTPException(status_code=404, detail="Event kind not found")
        feature = FirstOrderFeature(event_kind_id=event_kind_id, **request.model_dump())
        session.add(feature)
        await session.flush()
    return feature


@router.get(
    "/api/v1/first-order-features/{first_order_feature_id}/second-order-features",
    response_model=list[FeatureOptionResponse],
)
async def list_second_order_features(
    first_order_feature_id: int,
    session: AsyncSession = Depends(get_read_session),
) -> list[SecondOrderFeature]:
    return list(
        await session.scalars(
            select(SecondOrderFeature)
            .where(
                SecondOrderFeature.first_order_feature_id == first_order_feature_id,
                SecondOrderFeature.is_active.is_(True),
            )
            .order_by(SecondOrderFeature.sort_order)
        )
    )


@router.post(
    "/api/v1/first-order-features/{first_order_feature_id}/second-order-features",
    response_model=FeatureOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_second_order_feature(
    first_order_feature_id: int,
    request: FeatureOptionCreate,
    session: AsyncSession = Depends(get_write_session),
) -> SecondOrderFeature:
    async with session.begin():
        if await session.get(FirstOrderFeature, first_order_feature_id) is None:
            raise HTTPException(status_code=404, detail="First-order feature not found")
        feature = SecondOrderFeature(
            first_order_feature_id=first_order_feature_id, **request.model_dump()
        )
        session.add(feature)
        await session.flush()
    return feature


@router.get(
    "/api/v1/second-order-features/{second_order_feature_id}/third-order-features",
    response_model=list[FeatureOptionResponse],
)
async def list_third_order_features(
    second_order_feature_id: int,
    session: AsyncSession = Depends(get_read_session),
) -> list[ThirdOrderFeature]:
    return list(
        await session.scalars(
            select(ThirdOrderFeature)
            .where(
                ThirdOrderFeature.second_order_feature_id == second_order_feature_id,
                ThirdOrderFeature.is_active.is_(True),
            )
            .order_by(ThirdOrderFeature.sort_order)
        )
    )


@router.post(
    "/api/v1/second-order-features/{second_order_feature_id}/third-order-features",
    response_model=FeatureOptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_third_order_feature(
    second_order_feature_id: int,
    request: FeatureOptionCreate,
    session: AsyncSession = Depends(get_write_session),
) -> ThirdOrderFeature:
    async with session.begin():
        if await session.get(SecondOrderFeature, second_order_feature_id) is None:
            raise HTTPException(status_code=404, detail="Second-order feature not found")
        feature = ThirdOrderFeature(
            second_order_feature_id=second_order_feature_id, **request.model_dump()
        )
        session.add(feature)
        await session.flush()
    return feature


@router.get(  # TODO нужен ли этот метод вообще ?
    "/api/v1/feature-schemas/resolve",
    response_model=ClassificationResolutionResponse,
)
async def resolve_feature_schema(
    event_kind_id: int,
    first_order_feature_id: int | None = None,
    second_order_feature_id: int | None = None,
    third_order_feature_id: int | None = None,
    session: AsyncSession = Depends(get_read_session),
) -> ClassificationResolutionResponse:
    result = await session.execute(
        select(FeatureSchema, IncidentType)
        .outerjoin(IncidentType, IncidentType.id == FeatureSchema.incident_type_id)
        .where(
            FeatureSchema.event_kind_id == event_kind_id,
            FeatureSchema.first_order_feature_id == first_order_feature_id,
            FeatureSchema.second_order_feature_id == second_order_feature_id,
            FeatureSchema.third_order_feature_id == third_order_feature_id,
            FeatureSchema.is_active.is_(True),
        )
        .order_by(FeatureSchema.version.desc())
        .limit(1)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Feature schema not found")
    schema, incident_type = row
    return ClassificationResolutionResponse(
        feature_schema_id=schema.id,
        incident_type_id=schema.incident_type_id,
        incident_type_name=incident_type.name if incident_type is not None else None,
        ekp_name=incident_type.ekp_name if incident_type is not None else None,
        additional_features_schema=schema.json_schema,
    )


@router.post(
    "/api/v1/cards", response_model=CardResponse, status_code=status.HTTP_201_CREATED
)
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


@router.get("/api/v1/cards", response_model=list[CardListItem])
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


@router.get("/api/v1/cards/{card_id}", response_model=CardResponse)
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
    "/api/v1/cards/{card_id}/feature-history",
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
    "/api/v1/cards/{card_id}/status-history",
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
    "/api/v1/cards/{card_id}/services",
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


@router.patch("/api/v1/cards/{card_id}", response_model=CardResponse)
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


@router.put("/api/v1/cards/{card_id}/features", response_model=CardFeatureResponse)
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


@router.post("/api/v1/cards/{card_id}/statuses", response_model=CardResponse)
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
    "/api/v1/services",
    response_model=EmergencyServiceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_service(
    request: EmergencyServiceCreate,
    session: AsyncSession = Depends(get_write_session),
) -> EmergencyService:
    async with session.begin():
        service = EmergencyService(**request.model_dump())
        session.add(service)
        await session.flush()
    return service


@router.get("/api/v1/services", response_model=list[EmergencyServiceResponse])
async def list_services(
    session: AsyncSession = Depends(get_read_session),
) -> list[EmergencyService]:
    return list(
        await session.scalars(
            select(EmergencyService)
            .where(EmergencyService.is_active.is_(True))
            .order_by(EmergencyService.sort_order, EmergencyService.code)
        )
    )


@router.post(
    "/api/v1/cards/{card_id}/services",
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
    "/api/v1/card-services/{card_service_id}/statuses",
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
    "/api/v1/card-services/{card_service_id}/status-history",
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
