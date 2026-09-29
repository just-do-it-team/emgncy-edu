import uuid

from s112.api.identity import header_user_id, with_acting_user

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.common.dependencies import raise_http_error, simulation_service
from s112.api.dependencies import get_read_session, get_write_session
from s112.api.service import DomainError
from s112.api.simulation_schemas import OutgoingCallResponse, TrainingCallActionRequest
from s112.api.simulation_service import SimulationApplicationService
from s112.domain.models import TrainingCall


router = APIRouter(prefix='/api/v1', tags=['student/outgoing_calls'])


def _assert_identity(request: Request, user_id: uuid.UUID) -> None:
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, 'principal', None)
        if principal is None or principal.user_id != user_id:
            raise HTTPException(status_code=403, detail='User does not match token')


@router.get(
    '/cards/{card_id}/outgoing-call',
    response_model=OutgoingCallResponse | None,
)
async def get_outgoing_call(
    card_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Depends(header_user_id),
    session: AsyncSession = Depends(get_read_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingCall | None:
    _assert_identity(request, user_id)
    try:
        return await service.get_outgoing_call_for_card(session, card_id, user_id)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    '/cards/{card_id}/outgoing-call',
    response_model=OutgoingCallResponse,
)
async def start_outgoing_call(
    card_id: uuid.UUID,
    request: Request,
    body: TrainingCallActionRequest | None = Body(default=None),
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingCall:
    body = with_acting_user(request, body or TrainingCallActionRequest(), "user_id")
    try:
        async with session.begin():
            return await service.start_outgoing_call(session, card_id, body.user_id)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    '/outgoing-calls/{call_id}/complete',
    response_model=OutgoingCallResponse,
)
async def complete_outgoing_call(
    call_id: uuid.UUID,
    request: Request,
    body: TrainingCallActionRequest | None = Body(default=None),
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingCall:
    body = with_acting_user(request, body or TrainingCallActionRequest(), "user_id")
    try:
        async with session.begin():
            return await service.complete_outgoing_call(session, call_id, body.user_id)
    except DomainError as exc:
        raise_http_error(exc)
