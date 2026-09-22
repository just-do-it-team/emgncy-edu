import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.common.dependencies import raise_http_error, simulation_service
from s112.api.dependencies import get_read_session, get_write_session
from s112.api.service import DomainError
from s112.api.simulation_schemas import (
    AssignmentParticipantResponse,
    StartAssignmentRequest,
    StartAssignmentResponse,
    StudentActiveSessionContext,
    StudentAssignedScenarioMetadata,
    StudentScenarioAssignmentResponse,
)
from s112.api.simulation_service import SimulationApplicationService
from s112.common.enums import TrainingSessionStatus, UserRole
from s112.domain.models import (
    AssignmentParticipant,
    ScenarioAssignment,
    SimulationWorkspace,
    TrainingSession,
    UserAccount,
)


router = APIRouter(prefix="/api/v1", tags=["student/assigned_scenarios"])


def _student_assignment_response(
    assignment: ScenarioAssignment,
    participant: AssignmentParticipant,
    training_session: TrainingSession | None,
    workspace: SimulationWorkspace | None,
) -> StudentScenarioAssignmentResponse:
    snapshot = assignment.scenario_snapshot
    definition = snapshot.get("definition")
    cards = definition.get("cards", []) if isinstance(definition, dict) else []
    active_session = None
    if training_session is not None and workspace is not None:
        active_session = StudentActiveSessionContext(
            session_id=training_session.id,
            workspace_id=workspace.id,
            attempt_number=training_session.attempt_number,
            status=training_session.status,
            started_at=training_session.started_at,
        )
    return StudentScenarioAssignmentResponse(
        id=assignment.id,
        scenario=StudentAssignedScenarioMetadata(
            id=assignment.scenario_id,
            revision=assignment.scenario_revision,
            name=str(snapshot["name"]),
            description=snapshot.get("description"),
            difficulty=int(snapshot["difficulty"]),
            estimated_duration_seconds=int(snapshot["estimated_duration_seconds"]),
            cards_count=len(cards),
            workspace_mode=assignment.workspace_mode,
            completion_policy=str(snapshot["completion_policy"]),
        ),
        assigned_by=assignment.assigned_by,
        launch_policy=assignment.launch_policy,
        max_attempts=assignment.max_attempts,
        status=assignment.status,
        available_from=assignment.available_from,
        due_at=assignment.due_at,
        created_at=assignment.created_at,
        participant=AssignmentParticipantResponse.model_validate(participant),
        active_session=active_session,
    )


async def _require_student(session: AsyncSession, student_id: uuid.UUID) -> None:
    student = await session.get(UserAccount, student_id)
    if student is None or student.is_blocked:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.role != UserRole.STUDENT.value:
        raise HTTPException(status_code=403, detail="Student access required")


def _student_assignments_statement(student_id: uuid.UUID):
    active_statuses = [
        TrainingSessionStatus.CREATED.value,
        TrainingSessionStatus.RUNNING.value,
    ]
    return (
        select(
            ScenarioAssignment,
            AssignmentParticipant,
            TrainingSession,
            SimulationWorkspace,
        )
        .join(
            AssignmentParticipant,
            and_(
                AssignmentParticipant.assignment_id == ScenarioAssignment.id,
                AssignmentParticipant.user_id == student_id,
            ),
        )
        .outerjoin(
            TrainingSession,
            and_(
                TrainingSession.assignment_id == ScenarioAssignment.id,
                TrainingSession.status.in_(active_statuses),
            ),
        )
        .outerjoin(
            SimulationWorkspace,
            SimulationWorkspace.training_session_id == TrainingSession.id,
        )
    )


@router.get(
    "/student/scenario-assignments",
    response_model=list[StudentScenarioAssignmentResponse],
)
async def list_own_scenario_assignments(
    student_id: uuid.UUID = Header(alias="X-User-Id"),
    assignment_status: str | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_read_session),
) -> list[StudentScenarioAssignmentResponse]:
    await _require_student(session, student_id)
    statement = _student_assignments_statement(student_id)
    if assignment_status:
        statement = statement.where(ScenarioAssignment.status == assignment_status)
    rows = (
        await session.execute(statement.order_by(ScenarioAssignment.created_at.desc()))
    ).all()
    return [
        _student_assignment_response(assignment, participant, training_session, workspace)
        for assignment, participant, training_session, workspace in rows
    ]


@router.get(
    "/student/scenario-assignments/{assignment_id}",
    response_model=StudentScenarioAssignmentResponse,
)
async def get_own_scenario_assignment(
    assignment_id: uuid.UUID,
    student_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> StudentScenarioAssignmentResponse:
    await _require_student(session, student_id)
    row = (
        await session.execute(
            _student_assignments_statement(student_id).where(
                ScenarioAssignment.id == assignment_id
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario assignment not found")
    return _student_assignment_response(*row)


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
