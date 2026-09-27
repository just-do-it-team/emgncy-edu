import uuid

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.service import (
    CardApplicationService,
    ConflictError,
    DomainError,
    ForbiddenError,
    NotFoundError,
    ValidationError,
)
from s112.api.simulation_service import SimulationApplicationService


def application_service(request: Request) -> CardApplicationService:
    return CardApplicationService(request.app.state.settings.kafka_topic)


def simulation_service(request: Request) -> SimulationApplicationService:
    settings = request.app.state.settings
    return SimulationApplicationService(
        settings.kafka_topic,
        settings.audio_tts_request_topic,
        settings.seaweed_audio_prefix,
    )


def raise_http_error(exc: DomainError) -> None:
    detail = getattr(exc, "http_detail", str(exc))
    if isinstance(exc, NotFoundError):
        raise HTTPException(status_code=404, detail=detail) from exc
    if isinstance(exc, ConflictError):
        raise HTTPException(status_code=409, detail=detail) from exc
    if isinstance(exc, ForbiddenError):
        raise HTTPException(status_code=403, detail=detail) from exc
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
