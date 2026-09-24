from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.dependencies import get_read_session, get_write_session
from s112.api.schemas import (
    EmergencyServiceCreate,
    EmergencyServiceResponse,
    EventKindResponse,
    EventTypeResponse,
)
from s112.domain.models import (
    EmergencyService,
    EventKind,
    EventType,
)


router = APIRouter(prefix="/api/v1", tags=["common/reference_data"])


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
