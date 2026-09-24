import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.common.dependencies import raise_http_error, simulation_service
from s112.api.common.training.responses import teacher_monitoring_response
from s112.api.dependencies import get_read_session, get_write_session
from s112.api.service import DomainError
from s112.api.simulation_schemas import (
    IndividualSessionAbortRequest,
    ManualCardReleaseRequest,
    ScheduledCardResponse,
    SessionAbortRequest,
    TeacherMonitoringSession,
    TrainingCallResponse,
    TrainingSessionResponse,
)
from s112.api.simulation_service import SimulationApplicationService
from s112.common.enums import (
    ScenarioTriggerType,
    ScheduledCardStatus,
    TrainingCallStatus,
    UserRole,
    WorkspaceMemberRole,
)
from s112.domain.models import (
    ScenarioAssignment,
    SessionScheduledCard,
    SimulationWorkspace,
    TrainingSession,
    TrainingCall,
    UserAccount,
    WorkspaceMember,
)
from s112.scenario_worker.worker import ScenarioCallEmitter, ScenarioCardEmitter


router = APIRouter(prefix="/api/v1", tags=["teacher/active_sessions"])


@router.post(
    "/training-sessions/{session_id}/abort",
    response_model=TrainingSessionResponse,
)
async def abort_training_session(
    session_id: uuid.UUID,
    body: SessionAbortRequest | IndividualSessionAbortRequest,
    request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingSession:
    actor_id = body.teacher_id if isinstance(body, SessionAbortRequest) else body.user_id
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, "principal", None)
        if principal is None or principal.user_id != actor_id:
            raise HTTPException(status_code=403, detail="User does not match token")
    try:
        async with session.begin():
            if isinstance(body, SessionAbortRequest):
                return await service.abort_shared_session(
                    session, session_id, body.teacher_id, body.reason
                )
            return await service.abort_individual_session(session, session_id, actor_id)
    except DomainError as exc:
        raise_http_error(exc)


@router.get(
    "/teacher-monitoring/sessions",
    response_model=list[TeacherMonitoringSession],
)
async def list_teacher_monitoring_sessions(
    teacher_id: uuid.UUID,
    session_status: str | None = Query(default="RUNNING", alias="status"),
    session: AsyncSession = Depends(get_read_session),
) -> list[TeacherMonitoringSession]:
    teacher = await session.get(UserAccount, teacher_id)
    if teacher is None or teacher.is_blocked:
        raise HTTPException(status_code=404, detail="Teacher not found")
    if teacher.role not in {UserRole.TEACHER.value, UserRole.ADMINISTRATOR.value}:
        raise HTTPException(status_code=403, detail="Teacher access required")
    statement = (
        select(TrainingSession, ScenarioAssignment, SimulationWorkspace)
        .join(
            ScenarioAssignment,
            ScenarioAssignment.id == TrainingSession.assignment_id,
        )
        .join(
            SimulationWorkspace,
            SimulationWorkspace.training_session_id == TrainingSession.id,
        )
        .where(ScenarioAssignment.assigned_by == teacher_id)
    )
    if session_status:
        statement = statement.where(TrainingSession.status == session_status)
    rows = (
        await session.execute(statement.order_by(TrainingSession.started_at.desc()))
    ).all()
    return [
        await teacher_monitoring_response(
            session, training_session, assignment, workspace
        )
        for training_session, assignment, workspace in rows
    ]


@router.get(
    "/teacher-monitoring/sessions/{session_id}",
    response_model=TeacherMonitoringSession,
)
async def get_teacher_monitoring_session(
    session_id: uuid.UUID,
    teacher_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> TeacherMonitoringSession:
    row = (
        await session.execute(
            select(TrainingSession, ScenarioAssignment, SimulationWorkspace)
            .join(
                ScenarioAssignment,
                ScenarioAssignment.id == TrainingSession.assignment_id,
            )
            .join(
                SimulationWorkspace,
                SimulationWorkspace.training_session_id == TrainingSession.id,
            )
            .where(
                TrainingSession.id == session_id,
                ScenarioAssignment.assigned_by == teacher_id,
            )
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Monitored training session not found")
    training_session, assignment, workspace = row
    return await teacher_monitoring_response(
        session, training_session, assignment, workspace
    )


@router.post(
    "/training-sessions/{session_id}/scheduled-cards/{scenario_card_key}/release",
    response_model=ScheduledCardResponse,
)
async def release_manual_scenario_card(
    session_id: uuid.UUID,
    scenario_card_key: str,
    body: ManualCardReleaseRequest,
    request: Request,
    session: AsyncSession = Depends(get_write_session),
) -> SessionScheduledCard:
    try:
        async with session.begin():
            item = await session.scalar(
                select(SessionScheduledCard)
                .where(
                    SessionScheduledCard.training_session_id == session_id,
                    SessionScheduledCard.scenario_card_key == scenario_card_key,
                )
                .with_for_update()
            )
            if item is None:
                raise HTTPException(status_code=404, detail="Scheduled card not found")
            if item.trigger_type != ScenarioTriggerType.MANUAL.value:
                raise HTTPException(
                    status_code=409,
                    detail="Only a MANUAL scenario card can be released here",
                )
            if item.status not in {
                ScheduledCardStatus.PENDING.value,
                ScheduledCardStatus.EMITTED.value,
            }:
                raise HTTPException(
                    status_code=409,
                    detail=f"Scheduled card cannot be released from status {item.status}",
                )
            member = await session.get(WorkspaceMember, (item.workspace_id, body.user_id))
            if (
                member is None
                or member.left_at is not None
                or member.member_role != WorkspaceMemberRole.INSTRUCTOR.value
            ):
                raise HTTPException(status_code=403, detail="Instructor access required")
            emitter = ScenarioCardEmitter(request.app.state.settings.kafka_topic)
            await emitter.emit(session, item, actor_id=body.user_id)
            return item
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/training-sessions/{session_id}/incoming-calls/{scenario_item_key}/release",
    response_model=TrainingCallResponse,
)
async def release_manual_incoming_call(
    session_id: uuid.UUID,
    scenario_item_key: str,
    body: ManualCardReleaseRequest,
    session: AsyncSession = Depends(get_write_session),
) -> TrainingCall:
    async with session.begin():
        item = await session.scalar(
            select(TrainingCall)
            .where(
                TrainingCall.training_session_id == session_id,
                TrainingCall.scenario_item_key == scenario_item_key,
            )
            .with_for_update()
        )
        if item is None:
            raise HTTPException(status_code=404, detail="Incoming call not found")
        if item.trigger_type != ScenarioTriggerType.MANUAL.value:
            raise HTTPException(
                status_code=409,
                detail="Only a MANUAL incoming call can be released here",
            )
        if item.status not in {
            TrainingCallStatus.PENDING.value,
            TrainingCallStatus.RINGING.value,
        }:
            raise HTTPException(
                status_code=409,
                detail=f"Incoming call cannot be released from status {item.status}",
            )
        member = await session.get(WorkspaceMember, (item.workspace_id, body.user_id))
        if (
            member is None
            or member.left_at is not None
            or member.member_role != WorkspaceMemberRole.INSTRUCTOR.value
        ):
            raise HTTPException(status_code=403, detail="Instructor access required")
        await ScenarioCallEmitter().emit(session, item, actor_id=body.user_id)
        return item
