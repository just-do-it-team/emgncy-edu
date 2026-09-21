from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.dependencies import get_read_session, get_write_session
from s112.api.schemas import (
    ClassificationResolutionResponse,
    EmergencyServiceCreate,
    EmergencyServiceResponse,
    EventKindResponse,
    EventTypeResponse,
    FeatureOptionCreate,
    FeatureOptionResponse,
)
from s112.domain.models import (
    EmergencyService,
    EventKind,
    EventType,
    FeatureSchema,
    FirstOrderFeature,
    IncidentType,
    SecondOrderFeature,
    ThirdOrderFeature,
)


router = APIRouter(prefix="/api/v1")


@router.get("/event-types", response_model=list[EventTypeResponse])
async def list_event_types(
    session: AsyncSession = Depends(get_read_session),
) -> list[EventType]:
    return list(
        await session.scalars(
            select(EventType).where(EventType.is_active.is_(True)).order_by(EventType.sort_order)
        )
    )


@router.get(
    "/event-types/{event_type_id}/event-kinds",
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
    "/event-kinds/{event_kind_id}/first-order-features",
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
    "/event-kinds/{event_kind_id}/first-order-features",
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
    "/first-order-features/{first_order_feature_id}/second-order-features",
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
    "/first-order-features/{first_order_feature_id}/second-order-features",
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
    "/second-order-features/{second_order_feature_id}/third-order-features",
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
    "/second-order-features/{second_order_feature_id}/third-order-features",
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


@router.get(
    "/feature-schemas/resolve",
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
    "/services",
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


@router.get("/services", response_model=list[EmergencyServiceResponse])
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
