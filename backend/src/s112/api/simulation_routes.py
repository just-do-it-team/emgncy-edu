import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from s112.api.dependencies import get_read_session, get_write_session
from s112.api.routes import application_service, raise_http_error
from s112.api.schemas import (
    CardDecisionRequest,
    CardListItem,
    CardResponse,
    CardServiceResponse,
)
from s112.api.service import CardApplicationService, DomainError
from s112.api.simulation_schemas import (
    AssignmentBatchResponse,
    AssignmentParticipantResponse,
    CardTemplateCreate,
    CardTemplateResponse,
    ExpertAssessmentUpdate,
    ExpertReviewContextResponse,
    GroupScenarioAssignmentCreate,
    LearningGroupCreate,
    LearningGroupMemberResponse,
    LearningGroupMembersUpdate,
    LearningGroupResponse,
    LearningGroupUpdate,
    ManualCardReleaseRequest,
    ScenarioAssignmentCreate,
    ScenarioAssignmentResponse,
    ScenarioDeleteRequest,
    ScheduledCardResponse,
    SessionCompleteRequest,
    StartAssignmentRequest,
    StartAssignmentResponse,
    StudentTrainingHistoryItem,
    TeacherMonitoringParticipant,
    TeacherMonitoringSession,
    TrainingActionResponse,
    TrainingScenarioCreate,
    TrainingScenarioResponse,
    TrainingScenarioUpdate,
    TrainingSessionResponse,
)
from s112.api.simulation_service import SimulationApplicationService
from s112.domain.models import (
    AssignmentBatch,
    AssignmentParticipant,
    CardListProjection,
    CardService,
    CardTemplate,
    EmergencyService,
    IncidentCard,
    LearningGroup,
    LearningGroupMember,
    ScenarioAssignment,
    SessionScheduledCard,
    SimulationWorkspace,
    TrainingAction,
    TrainingScenario,
    TrainingSession,
    UserAccount,
    WorkspaceMember,
)
from s112.common.enums import (
    ScenarioTriggerType,
    ScheduledCardStatus,
    TrainingActionResult,
    UserRole,
    WorkspaceMemberRole,
)
from s112.scenario_worker.worker import ScenarioCardEmitter


router = APIRouter(prefix="/api/v1", tags=["training-simulation"])


def simulation_service(request: Request) -> SimulationApplicationService:
    return SimulationApplicationService(request.app.state.settings.kafka_topic)


async def _assignment_response(
    session: AsyncSession, assignment: ScenarioAssignment
) -> ScenarioAssignmentResponse:
    participants = list(
        await session.scalars(
            select(AssignmentParticipant)
            .where(AssignmentParticipant.assignment_id == assignment.id)
            .order_by(AssignmentParticipant.user_id)
        )
    )
    return ScenarioAssignmentResponse(
        id=assignment.id,
        scenario_id=assignment.scenario_id,
        scenario_revision=assignment.scenario_revision,
        assignment_batch_id=assignment.assignment_batch_id,
        assigned_by=assignment.assigned_by,
        workspace_mode=assignment.workspace_mode,
        launch_policy=assignment.launch_policy,
        max_attempts=assignment.max_attempts,
        status=assignment.status,
        available_from=assignment.available_from,
        due_at=assignment.due_at,
        created_at=assignment.created_at,
        participants=[AssignmentParticipantResponse.model_validate(item) for item in participants],
    )


async def _learning_group_response(
    session: AsyncSession, group: LearningGroup
) -> LearningGroupResponse:
    rows = (
        await session.execute(
            select(LearningGroupMember, UserAccount)
            .join(UserAccount, UserAccount.id == LearningGroupMember.student_id)
            .where(LearningGroupMember.group_id == group.id)
            .order_by(UserAccount.display_name, UserAccount.id)
        )
    ).all()
    return LearningGroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        teacher_id=group.teacher_id,
        is_active=group.is_active,
        created_at=group.created_at,
        updated_at=group.updated_at,
        members=[
            LearningGroupMemberResponse(
                student_id=member.student_id,
                display_name=user.display_name,
                joined_at=member.joined_at,
                removed_at=member.removed_at,
            )
            for member, user in rows
        ],
    )


async def _assignment_batch_response(
    session: AsyncSession,
    batch: AssignmentBatch,
    assignments: list[ScenarioAssignment] | None = None,
) -> AssignmentBatchResponse:
    if assignments is None:
        assignments = list(
            await session.scalars(
                select(ScenarioAssignment)
                .where(ScenarioAssignment.assignment_batch_id == batch.id)
                .order_by(ScenarioAssignment.created_at, ScenarioAssignment.id)
            )
        )
    return AssignmentBatchResponse(
        id=batch.id,
        group_id=batch.group_id,
        scenario_id=batch.scenario_id,
        assigned_by=batch.assigned_by,
        launch_policy=batch.launch_policy,
        max_attempts=batch.max_attempts,
        available_from=batch.available_from,
        due_at=batch.due_at,
        created_at=batch.created_at,
        assignments=[
            await _assignment_response(session, assignment)
            for assignment in assignments
        ],
    )


async def _teacher_monitoring_response(
    session: AsyncSession,
    training_session: TrainingSession,
    assignment: ScenarioAssignment,
    workspace: SimulationWorkspace,
) -> TeacherMonitoringSession:
    group: LearningGroup | None = None
    if assignment.assignment_batch_id is not None:
        batch = await session.get(AssignmentBatch, assignment.assignment_batch_id)
        if batch is not None:
            group = await session.get(LearningGroup, batch.group_id)
    participant_rows = (
        await session.execute(
            select(AssignmentParticipant, UserAccount)
            .join(UserAccount, UserAccount.id == AssignmentParticipant.user_id)
            .where(AssignmentParticipant.assignment_id == assignment.id)
            .order_by(UserAccount.display_name, UserAccount.id)
        )
    ).all()
    scheduled_cards = list(
        await session.scalars(
            select(SessionScheduledCard)
            .where(
                SessionScheduledCard.training_session_id == training_session.id
            )
            .order_by(SessionScheduledCard.scenario_card_key)
        )
    )
    successful_actions = int(
        await session.scalar(
            select(func.count())
            .select_from(TrainingAction)
            .where(
                TrainingAction.training_session_id == training_session.id,
                TrainingAction.result == TrainingActionResult.SUCCESS.value,
            )
        )
        or 0
    )
    rejected_actions = int(
        await session.scalar(
            select(func.count())
            .select_from(TrainingAction)
            .where(
                TrainingAction.training_session_id == training_session.id,
                TrainingAction.result == TrainingActionResult.REJECTED.value,
            )
        )
        or 0
    )
    last_activity_at = await session.scalar(
        select(func.max(TrainingAction.occurred_at)).where(
            TrainingAction.training_session_id == training_session.id
        )
    )
    return TeacherMonitoringSession(
        session_id=training_session.id,
        assignment_id=assignment.id,
        assignment_batch_id=assignment.assignment_batch_id,
        group_id=group.id if group else None,
        group_name=group.name if group else None,
        scenario_id=assignment.scenario_id,
        scenario_name=str(assignment.scenario_snapshot.get("name", "")),
        workspace_id=workspace.id,
        status=training_session.status,
        attempt_number=training_session.attempt_number,
        started_at=training_session.started_at,
        completed_at=training_session.completed_at,
        score=training_session.score,
        passed=training_session.passed,
        cards_total=len(scheduled_cards),
        cards_pending=sum(
            item.status == ScheduledCardStatus.PENDING.value
            for item in scheduled_cards
        ),
        cards_emitted=sum(
            item.status == ScheduledCardStatus.EMITTED.value
            for item in scheduled_cards
        ),
        pending_card_keys=[
            item.scenario_card_key
            for item in scheduled_cards
            if item.status == ScheduledCardStatus.PENDING.value
        ],
        emitted_card_keys=[
            item.scenario_card_key
            for item in scheduled_cards
            if item.status == ScheduledCardStatus.EMITTED.value
        ],
        successful_actions=successful_actions,
        rejected_actions=rejected_actions,
        last_activity_at=last_activity_at,
        participants=[
            TeacherMonitoringParticipant(
                user_id=participant.user_id,
                display_name=user.display_name,
                status=participant.status,
                position_code=participant.position_code,
            )
            for participant, user in participant_rows
        ],
    )
@router.post(
    "/card-templates",
    response_model=CardTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_card_template(
    request: CardTemplateCreate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> CardTemplate:
    try:
        async with session.begin():
            return await service.create_template(session, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/card-templates", response_model=list[CardTemplateResponse])
async def list_card_templates(
    active_only: bool = True,
    session: AsyncSession = Depends(get_read_session),
) -> list[CardTemplate]:
    statement = select(CardTemplate)
    if active_only:
        statement = statement.where(CardTemplate.is_active.is_(True))
    return list(
        await session.scalars(
            statement.order_by(CardTemplate.name, CardTemplate.template_key, CardTemplate.version)
        )
    )


@router.get("/card-templates/{template_id}", response_model=CardTemplateResponse)
async def get_card_template(
    template_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> CardTemplate:
    template = await session.get(CardTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Card template not found")
    return template


@router.post(
    "/training-scenarios",
    response_model=TrainingScenarioResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_training_scenario(
    request: TrainingScenarioCreate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingScenario:
    try:
        async with session.begin():
            return await service.create_scenario(session, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/training-scenarios", response_model=list[TrainingScenarioResponse])
async def list_training_scenarios(
    scenario_status: str | None = Query(default=None, alias="status"),
    difficulty: int | None = Query(default=None, ge=1, le=5),
    include_archived: bool = False,
    session: AsyncSession = Depends(get_read_session),
) -> list[TrainingScenario]:
    statement = select(TrainingScenario)
    if scenario_status:
        statement = statement.where(TrainingScenario.status == scenario_status)
    elif not include_archived:
        statement = statement.where(
            TrainingScenario.status != "ARCHIVED"
        )
    if difficulty is not None:
        statement = statement.where(TrainingScenario.difficulty == difficulty)
    return list(await session.scalars(statement.order_by(TrainingScenario.name)))


@router.get(
    "/training-scenarios/{scenario_id}", response_model=TrainingScenarioResponse
)
async def get_training_scenario(
    scenario_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> TrainingScenario:
    scenario = await session.get(TrainingScenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Training scenario not found")
    return scenario


@router.patch(
    "/training-scenarios/{scenario_id}", response_model=TrainingScenarioResponse
)
async def update_training_scenario(
    scenario_id: uuid.UUID,
    request: TrainingScenarioUpdate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingScenario:
    try:
        async with session.begin():
            return await service.update_scenario(session, scenario_id, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.delete(
    "/training-scenarios/{scenario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_training_scenario(
    scenario_id: uuid.UUID,
    request: ScenarioDeleteRequest,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> None:
    try:
        async with session.begin():
            await service.delete_scenario(session, scenario_id, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/learning-groups",
    response_model=LearningGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_learning_group(
    request: LearningGroupCreate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> LearningGroupResponse:
    try:
        async with session.begin():
            group = await service.create_learning_group(session, request)
        return await _learning_group_response(session, group)
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/learning-groups", response_model=list[LearningGroupResponse])
async def list_learning_groups(
    teacher_id: uuid.UUID,
    active_only: bool = True,
    session: AsyncSession = Depends(get_read_session),
) -> list[LearningGroupResponse]:
    statement = select(LearningGroup).where(LearningGroup.teacher_id == teacher_id)
    if active_only:
        statement = statement.where(LearningGroup.is_active.is_(True))
    groups = list(await session.scalars(statement.order_by(LearningGroup.name)))
    return [await _learning_group_response(session, group) for group in groups]


@router.get(
    "/learning-groups/{group_id}", response_model=LearningGroupResponse
)
async def get_learning_group(
    group_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> LearningGroupResponse:
    group = await session.get(LearningGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Learning group not found")
    return await _learning_group_response(session, group)


@router.patch(
    "/learning-groups/{group_id}", response_model=LearningGroupResponse
)
async def update_learning_group(
    group_id: uuid.UUID,
    request: LearningGroupUpdate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> LearningGroupResponse:
    try:
        async with session.begin():
            group = await service.update_learning_group(session, group_id, request)
        return await _learning_group_response(session, group)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/learning-groups/{group_id}/members",
    response_model=LearningGroupResponse,
)
async def add_learning_group_members(
    group_id: uuid.UUID,
    request: LearningGroupMembersUpdate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> LearningGroupResponse:
    try:
        async with session.begin():
            group = await service.add_learning_group_members(session, group_id, request)
        return await _learning_group_response(session, group)
    except DomainError as exc:
        raise_http_error(exc)


@router.delete(
    "/learning-groups/{group_id}/members/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_learning_group_member(
    group_id: uuid.UUID,
    student_id: uuid.UUID,
    actor_id: uuid.UUID,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> None:
    try:
        async with session.begin():
            await service.remove_learning_group_member(
                session, group_id, student_id, actor_id
            )
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/learning-groups/{group_id}/scenario-assignments",
    response_model=AssignmentBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_learning_group_assignment(
    group_id: uuid.UUID,
    request: GroupScenarioAssignmentCreate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> AssignmentBatchResponse:
    try:
        async with session.begin():
            batch, assignments = await service.create_group_assignment(
                session, group_id, request
            )
        return await _assignment_batch_response(session, batch, assignments)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/scenario-assignments",
    response_model=ScenarioAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_scenario_assignment(
    request: ScenarioAssignmentCreate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> ScenarioAssignmentResponse:
    try:
        async with session.begin():
            assignment = await service.create_assignment(session, request)
        return await _assignment_response(session, assignment)
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/scenario-assignments", response_model=list[ScenarioAssignmentResponse])
async def list_scenario_assignments(
    participant_user_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
    assigned_by: uuid.UUID | None = None,
    assignment_status: str | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_read_session),
) -> list[ScenarioAssignmentResponse]:
    statement = select(ScenarioAssignment)
    if participant_user_id is not None:
        statement = statement.join(
            AssignmentParticipant,
            AssignmentParticipant.assignment_id == ScenarioAssignment.id,
        ).where(AssignmentParticipant.user_id == participant_user_id)
    if group_id is not None:
        statement = statement.join(
            AssignmentBatch,
            AssignmentBatch.id == ScenarioAssignment.assignment_batch_id,
        ).where(AssignmentBatch.group_id == group_id)
    if assigned_by is not None:
        statement = statement.where(ScenarioAssignment.assigned_by == assigned_by)
    if assignment_status:
        statement = statement.where(ScenarioAssignment.status == assignment_status)
    assignments = list(
        await session.scalars(statement.order_by(ScenarioAssignment.created_at.desc()))
    )
    return [await _assignment_response(session, assignment) for assignment in assignments]


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


@router.post(
    "/training-sessions/{session_id}/complete",
    response_model=TrainingSessionResponse,
)
async def complete_training_session(
    session_id: uuid.UUID,
    request: SessionCompleteRequest,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingSession:
    try:
        async with session.begin():
            return await service.complete_session(session, session_id, request.user_id)
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/training-sessions", response_model=list[TrainingSessionResponse])
async def list_training_sessions(
    assignment_id: uuid.UUID | None = None,
    participant_user_id: uuid.UUID | None = None,
    session_status: str | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_read_session),
) -> list[TrainingSession]:
    statement = select(TrainingSession)
    if assignment_id is not None:
        statement = statement.where(TrainingSession.assignment_id == assignment_id)
    if participant_user_id is not None:
        statement = statement.join(
            AssignmentParticipant,
            AssignmentParticipant.assignment_id == TrainingSession.assignment_id,
        ).where(AssignmentParticipant.user_id == participant_user_id)
    if session_status:
        statement = statement.where(TrainingSession.status == session_status)
    return list(
        await session.scalars(statement.order_by(TrainingSession.started_at.desc()))
    )


@router.get(
    "/students/{student_id}/training-history",
    response_model=list[StudentTrainingHistoryItem],
)
async def get_student_training_history(
    student_id: uuid.UUID,
    teacher_id: uuid.UUID,
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_read_session),
) -> list[StudentTrainingHistoryItem]:
    rows = (
        await session.execute(
            select(
                TrainingSession,
                ScenarioAssignment,
                AssignmentBatch,
                LearningGroup,
            )
            .join(
                ScenarioAssignment,
                ScenarioAssignment.id == TrainingSession.assignment_id,
            )
            .join(
                AssignmentParticipant,
                AssignmentParticipant.assignment_id == ScenarioAssignment.id,
            )
            .outerjoin(
                AssignmentBatch,
                AssignmentBatch.id == ScenarioAssignment.assignment_batch_id,
            )
            .outerjoin(LearningGroup, LearningGroup.id == AssignmentBatch.group_id)
            .where(
                AssignmentParticipant.user_id == student_id,
                ScenarioAssignment.assigned_by == teacher_id,
            )
            .order_by(TrainingSession.started_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        StudentTrainingHistoryItem(
            session_id=training_session.id,
            assignment_id=assignment.id,
            assignment_batch_id=assignment.assignment_batch_id,
            group_id=group.id if group else None,
            group_name=group.name if group else None,
            scenario_id=assignment.scenario_id,
            scenario_name=str(assignment.scenario_snapshot.get("name", "")),
            attempt_number=training_session.attempt_number,
            status=training_session.status,
            started_at=training_session.started_at,
            completed_at=training_session.completed_at,
            automatic_score=training_session.score,
            automatic_passed=training_session.passed,
            automatic_result=training_session.result,
            expert_score=training_session.expert_score,
            expert_passed=training_session.expert_passed,
            final_score=(
                training_session.expert_score
                if training_session.expert_score is not None
                else training_session.score
            ),
            final_passed=(
                training_session.expert_passed
                if training_session.expert_passed is not None
                else training_session.passed
            ),
            expert_comment=training_session.expert_comment,
            expert_evaluated_by=training_session.expert_evaluated_by,
            expert_evaluated_at=training_session.expert_evaluated_at,
        )
        for training_session, assignment, _batch, group in rows
    ]


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
        await _teacher_monitoring_response(
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
    return await _teacher_monitoring_response(
        session, training_session, assignment, workspace
    )


@router.get(
    "/training-sessions/{session_id}", response_model=TrainingSessionResponse
)
async def get_training_session(
    session_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> TrainingSession:
    training_session = await session.get(TrainingSession, session_id)
    if training_session is None:
        raise HTTPException(status_code=404, detail="Training session not found")
    return training_session


@router.get(
    "/training-sessions/{session_id}/expert-review-context",
    response_model=ExpertReviewContextResponse,
)
async def get_expert_review_context(
    session_id: uuid.UUID,
    teacher_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> dict:
    try:
        return await service.build_expert_review_context(
            session, session_id, teacher_id
        )
    except DomainError as exc:
        raise_http_error(exc)


@router.put(
    "/training-sessions/{session_id}/expert-assessment",
    response_model=TrainingSessionResponse,
)
async def update_expert_assessment(
    session_id: uuid.UUID,
    request: ExpertAssessmentUpdate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingSession:
    try:
        async with session.begin():
            return await service.update_expert_assessment(
                session, session_id, request
            )
    except DomainError as exc:
        raise_http_error(exc)


@router.get(
    "/training-sessions/{session_id}/actions",
    response_model=list[TrainingActionResponse],
)
async def list_training_actions(
    session_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> list[TrainingAction]:
    return list(
        await session.scalars(
            select(TrainingAction)
            .where(TrainingAction.training_session_id == session_id)
            .order_by(TrainingAction.occurred_at, TrainingAction.id)
        )
    )


@router.get(
    "/training-sessions/{session_id}/scheduled-cards",
    response_model=list[ScheduledCardResponse],
)
async def list_scheduled_cards(
    session_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> list[SessionScheduledCard]:
    return list(
        await session.scalars(
            select(SessionScheduledCard)
            .where(SessionScheduledCard.training_session_id == session_id)
            .order_by(SessionScheduledCard.scheduled_at, SessionScheduledCard.scenario_card_key)
        )
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
                    status_code=409, detail="Only a MANUAL scenario card can be released here"
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


@router.get(
    "/workspaces/{workspace_id}/cards",
    response_model=list[CardListItem],
)
async def list_workspace_cards(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_read_session),
) -> list[CardListProjection]:
    member = await session.get(WorkspaceMember, (workspace_id, user_id))
    if member is None or member.left_at is not None:
        raise HTTPException(status_code=403, detail="Workspace access denied")
    statement = select(CardListProjection).where(
        CardListProjection.workspace_id == workspace_id
    )
    if (
        member.member_role == WorkspaceMemberRole.PARTICIPANT.value
        and member.position_code
    ):
        statement = (
            statement.join(
                CardService, CardService.card_id == CardListProjection.card_id
            )
            .join(EmergencyService, EmergencyService.id == CardService.service_id)
            .where(
                CardService.is_active.is_(True),
                EmergencyService.code == member.position_code,
                EmergencyService.is_active.is_(True),
            )
            .distinct()
        )
    return list(
        await session.scalars(
            statement.order_by(CardListProjection.registered_at.desc()).limit(limit)
        )
    )


@router.get(
    "/workspaces/{workspace_id}/cards/{card_id}",
    response_model=CardResponse,
)
async def get_workspace_card(
    workspace_id: uuid.UUID,
    card_id: uuid.UUID,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> IncidentCard:
    member = await session.get(WorkspaceMember, (workspace_id, user_id))
    if member is None or member.left_at is not None:
        raise HTTPException(status_code=403, detail="Workspace access denied")
    filters = [
        IncidentCard.id == card_id,
        IncidentCard.workspace_id == workspace_id,
    ]
    if (
        member.member_role == WorkspaceMemberRole.PARTICIPANT.value
        and member.position_code
    ):
        filters.append(
            select(CardService.id)
            .join(EmergencyService, EmergencyService.id == CardService.service_id)
            .where(
                CardService.card_id == IncidentCard.id,
                CardService.is_active.is_(True),
                EmergencyService.code == member.position_code,
                EmergencyService.is_active.is_(True),
            )
            .exists()
        )
    card = await session.scalar(
        select(IncidentCard)
        .options(
            selectinload(IncidentCard.features),
            selectinload(IncidentCard.services),
        )
        .where(*filters)
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@router.post(
    "/workspaces/{workspace_id}/cards/{card_id}/open",
    response_model=CardServiceResponse,
)
async def open_workspace_card(
    workspace_id: uuid.UUID,
    card_id: uuid.UUID,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> CardService:
    try:
        async with session.begin():
            return await service.open_card_for_operator(
                session, workspace_id, card_id, user_id
            )
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/workspaces/{workspace_id}/cards/{card_id}/decision",
    response_model=CardServiceResponse,
)
async def decide_workspace_card(
    workspace_id: uuid.UUID,
    card_id: uuid.UUID,
    body: CardDecisionRequest,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
    service: CardApplicationService = Depends(application_service),
) -> CardService:
    try:
        async with session.begin():
            return await service.decide_card_for_operator(
                session,
                workspace_id,
                card_id,
                user_id,
                body.decision,
                comment=body.comment,
                request_id=body.request_id,
            )
    except DomainError as exc:
        raise_http_error(exc)
    ExpertAssessmentUpdate,
    ExpertReviewContextResponse,
    GroupScenarioAssignmentCreate,
    LearningGroupCreate,
    LearningGroupMemberResponse,
    LearningGroupMembersUpdate,
    LearningGroupResponse,
    LearningGroupUpdate,
    ScenarioDeleteRequest,
    StudentTrainingHistoryItem,
    TeacherMonitoringParticipant,
    TeacherMonitoringSession,
    LearningGroup,
    LearningGroupMember,
