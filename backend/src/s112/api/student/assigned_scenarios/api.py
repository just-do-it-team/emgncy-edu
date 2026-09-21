import uuid

from fastapi import APIRouter, Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.common.dependencies import raise_http_error, simulation_service
from s112.api.dependencies import get_write_session
from s112.api.service import DomainError
from s112.api.simulation_schemas import StartAssignmentRequest, StartAssignmentResponse
from s112.api.simulation_service import SimulationApplicationService


router = APIRouter(prefix="/api/v1", tags=["training-simulation"])


@router.post(
    "/scenario-assignments/{assignment_id}/start",
    response_model=StartAssignmentResponse,
)
async def start_scenario_assignment(
    assignment_id: uuid.UUID,
    request: StartAssignmentRequest,
    idempotency_key: str = Header(min_length=1, max_length=128, alias="Idempotency-Key"),
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> StartAssignmentResponse:
    try:
        async with session.begin():
            training_session, workspace, replay = await service.start_individual_assignment(
                session, assignment_id, request.user_id, idempotency_key
            )
        return StartAssignmentResponse(
            session_id=training_session.id,
            workspace_id=workspace.id,
            assignment_id=assignment_id,
            attempt_number=training_session.attempt_number,
            status=training_session.status,
            started_at=training_session.started_at,
            idempotent_replay=replay,
        )
    except DomainError as exc:
        raise_http_error(exc)
