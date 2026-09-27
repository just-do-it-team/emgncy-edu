import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.common.dependencies import raise_http_error, simulation_service
from s112.api.dependencies import get_read_session, get_write_session
from s112.api.service import DomainError
from s112.api.simulation_schemas import (
    CardTemplateCreate,
    CardTemplateDeleteRequest,
    CardTemplateResponse,
    IncomingCallTemplateCreate,
    IncomingCallTemplateDeleteRequest,
    IncomingCallTemplateResponse,
    ScenarioDeleteRequest,
    TemplateScenarioUpgradeRequest,
    TrainingScenarioCreate,
    TrainingScenarioDetailResponse,
    TrainingScenarioResponse,
    TrainingScenarioUpdate,
)
from s112.api.simulation_service import SimulationApplicationService
from s112.api.teacher.training_content.scenario_details import scenario_detail_response
from s112.common.enums import UserRole
from s112.domain.models import (
    CardTemplate,
    IncomingCallTemplate,
    TrainingScenario,
    UserAccount,
)


router = APIRouter(prefix="/api/v1", tags=["teacher/training_content"])


def _assert_actor_identity(request: Request, user_id: uuid.UUID) -> None:
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, "principal", None)
        if principal is None or principal.user_id != user_id:
            raise HTTPException(status_code=403, detail="Teacher does not match token")


async def _require_teacher_or_administrator(
    session: AsyncSession, user_id: uuid.UUID
) -> None:
    user = await session.get(UserAccount, user_id)
    if user is None or user.is_blocked:
        raise HTTPException(status_code=404, detail="Teacher not found")
    if user.role not in {UserRole.TEACHER.value, UserRole.ADMINISTRATOR.value}:
        raise HTTPException(status_code=403, detail="Teacher access required")


@router.post(
    "/card-templates",
    response_model=CardTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_card_template(
    request: CardTemplateCreate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> CardTemplate:
    _assert_actor_identity(http_request, request.created_by)
    try:
        async with session.begin():
            return await service.create_template(session, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/card-templates", response_model=list[CardTemplateResponse])
async def list_card_templates(
    http_request: Request,
    active_only: bool = True,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> list[CardTemplate]:
    _assert_actor_identity(http_request, user_id)
    await _require_teacher_or_administrator(session, user_id)
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
    http_request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> CardTemplate:
    _assert_actor_identity(http_request, user_id)
    await _require_teacher_or_administrator(session, user_id)
    template = await session.get(CardTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Card template not found")
    return template


@router.delete(
    "/card-templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_card_template(
    template_id: uuid.UUID,
    request: CardTemplateDeleteRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> None:
    _assert_actor_identity(http_request, request.deleted_by)
    try:
        async with session.begin():
            await service.delete_template(session, template_id, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/card-templates/{template_id}/upgrade-scenarios",
    response_model=list[TrainingScenarioResponse],
)
async def upgrade_card_template_scenarios(
    template_id: uuid.UUID,
    request: TemplateScenarioUpgradeRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> list[TrainingScenario]:
    _assert_actor_identity(http_request, request.updated_by)
    try:
        async with session.begin():
            return await service.upgrade_card_template_scenarios(
                session, template_id, request
            )
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/incoming-call-templates",
    response_model=IncomingCallTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_incoming_call_template(
    request: IncomingCallTemplateCreate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> IncomingCallTemplate:
    _assert_actor_identity(http_request, request.created_by)
    try:
        async with session.begin():
            return await service.create_incoming_call_template(session, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.get(
    "/incoming-call-templates",
    response_model=list[IncomingCallTemplateResponse],
)
async def list_incoming_call_templates(
    http_request: Request,
    active_only: bool = True,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> list[IncomingCallTemplate]:
    _assert_actor_identity(http_request, user_id)
    await _require_teacher_or_administrator(session, user_id)
    statement = select(IncomingCallTemplate)
    if active_only:
        statement = statement.where(IncomingCallTemplate.is_active.is_(True))
    return list(
        await session.scalars(
            statement.order_by(
                IncomingCallTemplate.name,
                IncomingCallTemplate.template_key,
                IncomingCallTemplate.version,
            )
        )
    )


@router.get(
    "/incoming-call-templates/{template_id}",
    response_model=IncomingCallTemplateResponse,
)
async def get_incoming_call_template(
    template_id: uuid.UUID,
    http_request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> IncomingCallTemplate:
    _assert_actor_identity(http_request, user_id)
    await _require_teacher_or_administrator(session, user_id)
    template = await session.get(IncomingCallTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Incoming call template not found")
    return template


@router.delete(
    "/incoming-call-templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_incoming_call_template(
    template_id: uuid.UUID,
    request: IncomingCallTemplateDeleteRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> None:
    _assert_actor_identity(http_request, request.deleted_by)
    try:
        async with session.begin():
            await service.delete_incoming_call_template(session, template_id, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/incoming-call-templates/{template_id}/upgrade-scenarios",
    response_model=list[TrainingScenarioResponse],
)
async def upgrade_incoming_call_template_scenarios(
    template_id: uuid.UUID,
    request: TemplateScenarioUpgradeRequest,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> list[TrainingScenario]:
    _assert_actor_identity(http_request, request.updated_by)
    try:
        async with session.begin():
            return await service.upgrade_incoming_call_template_scenarios(
                session, template_id, request
            )
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/training-scenarios",
    response_model=TrainingScenarioResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_training_scenario(
    request: TrainingScenarioCreate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingScenario:
    _assert_actor_identity(http_request, request.created_by)
    try:
        async with session.begin():
            return await service.create_scenario(session, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/training-scenarios", response_model=list[TrainingScenarioResponse])
async def list_training_scenarios(
    http_request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    scenario_status: str | None = Query(default=None, alias="status"),
    difficulty: int | None = Query(default=None, ge=1, le=4),
    include_archived: bool = False,
    session: AsyncSession = Depends(get_read_session),
) -> list[TrainingScenario]:
    _assert_actor_identity(http_request, user_id)
    await _require_teacher_or_administrator(session, user_id)
    statement = select(TrainingScenario)
    if scenario_status:
        statement = statement.where(TrainingScenario.status == scenario_status)
    elif not include_archived:
        statement = statement.where(TrainingScenario.status != "ARCHIVED")
    if difficulty is not None:
        statement = statement.where(TrainingScenario.difficulty == difficulty)
    return list(await session.scalars(statement.order_by(TrainingScenario.name)))


@router.get(
    "/training-scenarios/{scenario_id}", response_model=TrainingScenarioDetailResponse
)
async def get_training_scenario(
    scenario_id: uuid.UUID,
    http_request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> TrainingScenarioDetailResponse:
    _assert_actor_identity(http_request, user_id)
    await _require_teacher_or_administrator(session, user_id)
    scenario = await session.get(TrainingScenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Training scenario not found")
    return await scenario_detail_response(session, scenario)


@router.patch(
    "/training-scenarios/{scenario_id}", response_model=TrainingScenarioResponse
)
async def update_training_scenario(
    scenario_id: uuid.UUID,
    request: TrainingScenarioUpdate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingScenario:
    _assert_actor_identity(http_request, request.updated_by)
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
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> None:
    _assert_actor_identity(http_request, request.deleted_by)
    try:
        async with session.begin():
            await service.delete_scenario(session, scenario_id, request)
    except DomainError as exc:
        raise_http_error(exc)
