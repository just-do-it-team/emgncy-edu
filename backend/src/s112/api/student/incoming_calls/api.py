import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.common.dependencies import raise_http_error, simulation_service
from s112.api.dependencies import get_write_session
from s112.api.service import DomainError
from s112.api.simulation_schemas import (
    TrainingCallActionRequest,
    TrainingCallCardLinkRequest,
    TrainingCallResponse,
)
from s112.api.simulation_service import SimulationApplicationService
from s112.domain.models import TrainingCall


router = APIRouter(prefix="/api/v1", tags=["student/incoming_calls"])


def _assert_operator_identity(http_request: Request, user_id: uuid.UUID) -> None:
    if http_request.app.state.auth_settings.enabled:
        principal = getattr(http_request.state, "principal", None)
        if principal is None or principal.user_id != user_id:
            raise HTTPException(status_code=403, detail="User does not match token")


@router.post(
    "/incoming-calls/{call_id}/answer",
    response_model=TrainingCallResponse,
)
async def answer_incoming_call(
    call_id: uuid.UUID,
    request: TrainingCallActionRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingCall:
    _assert_operator_identity(http_request, request.user_id)
    try:
        async with session.begin():
            return await service.answer_incoming_call(session, call_id, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/incoming-calls/{call_id}/incident-card",
    response_model=TrainingCallResponse,
)
async def link_incoming_call_card(
    call_id: uuid.UUID,
    request: TrainingCallCardLinkRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingCall:
    _assert_operator_identity(http_request, request.user_id)
    try:
        async with session.begin():
            return await service.link_incoming_call_card(session, call_id, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/incoming-calls/{call_id}/complete",
    response_model=TrainingCallResponse,
)
async def complete_incoming_call(
    call_id: uuid.UUID,
    request: TrainingCallActionRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingCall:
    _assert_operator_identity(http_request, request.user_id)
    try:
        async with session.begin():
            return await service.complete_incoming_call(session, call_id, request)
    except DomainError as exc:
        raise_http_error(exc)
