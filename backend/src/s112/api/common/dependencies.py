import uuid

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.service import (
    CardApplicationService,
    ConflictError,
    DomainError,
    NotFoundError,
    ValidationError,
)
from s112.api.simulation_service import SimulationApplicationService


def application_service(request: Request) -> CardApplicationService:
    return CardApplicationService(request.app.state.settings.kafka_topic)


def simulation_service(request: Request) -> SimulationApplicationService:
    return SimulationApplicationService(request.app.state.settings.kafka_topic)


def raise_http_error(exc: DomainError) -> None:
    detail = getattr(exc, "http_detail", str(exc))
    if isinstance(exc, NotFoundError):
        raise HTTPException(status_code=404, detail=detail) from exc
    if isinstance(exc, ConflictError):
        raise HTTPException(status_code=409, detail=detail) from exc
    if isinstance(exc, ValidationError):
        raise HTTPException(status_code=422, detail=detail) from exc
    raise HTTPException(status_code=400, detail=detail) from exc


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
