import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from s112.api.dependencies import get_read_session, get_write_session
from s112.api.routes import raise_http_error
from s112.api.schemas import CardListItem, CardResponse
from s112.api.service import DomainError
from s112.api.simulation_schemas import (
    AssignmentParticipantResponse,
    CardTemplateCreate,
    CardTemplateResponse,
    ManualCardReleaseRequest,
    ScenarioAssignmentCreate,
    ScenarioAssignmentResponse,
    ScheduledCardResponse,
    SessionCompleteRequest,
    StartAssignmentRequest,
    StartAssignmentResponse,
    TrainingActionResponse,
    TrainingScenarioCreate,
    TrainingScenarioResponse,
    TrainingScenarioUpdate,
    TrainingSessionResponse,
)
from s112.api.simulation_service import SimulationApplicationService
from s112.domain.models import (
    AssignmentParticipant,
    CardListProjection,
    CardTemplate,
    IncidentCard,
    ScenarioAssignment,
    SessionScheduledCard,
    TrainingAction,
    TrainingScenario,
    TrainingSession,
    WorkspaceMember,
)
from s112.common.enums import (
    ScenarioTriggerType,
    ScheduledCardStatus,
    WorkspaceMemberRole,
)
from s112.scenario_worker.worker import ScenarioCardEmitter


router = APIRouter(prefix="/api/v1", tags=["training-simulation"])


def simulation_service() -> SimulationApplicationService:
    return SimulationApplicationService()


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
    session: AsyncSession = Depends(get_read_session),
) -> list[TrainingScenario]:
    statement = select(TrainingScenario)
    if scenario_status:
        statement = statement.where(TrainingScenario.status == scenario_status)
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
    assignment_status: str | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_read_session),
) -> list[ScenarioAssignmentResponse]:
    statement = select(ScenarioAssignment)
    if participant_user_id is not None:
        statement = statement.join(
            AssignmentParticipant,
            AssignmentParticipant.assignment_id == ScenarioAssignment.id,
        ).where(AssignmentParticipant.user_id == participant_user_id)
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
    return list(
        await session.scalars(
            select(CardListProjection)
            .where(CardListProjection.workspace_id == workspace_id)
            .order_by(CardListProjection.registered_at.desc())
            .limit(limit)
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
    card = await session.scalar(
        select(IncidentCard)
        .options(
            selectinload(IncidentCard.features),
            selectinload(IncidentCard.services),
        )
        .where(
            IncidentCard.id == card_id,
            IncidentCard.workspace_id == workspace_id,
        )
    )
    if card is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return card
