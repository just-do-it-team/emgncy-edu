import uuid

from s112.api.identity import header_user_id, with_acting_user
from collections.abc import Sequence
from typing import TypeVar

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.common.dependencies import raise_http_error, simulation_service
from s112.api.dependencies import get_read_session, get_write_session
from s112.api.service import DomainError
from s112.api.simulation_schemas import (
    CardTemplateCreate,
    CardTemplateDeleteRequest,
    CardTemplateGenerationCreate,
    CardTemplateGenerationResponse,
    CardTemplateResponse,
    CardTemplateUpdate,
    IncomingCallTemplateCreate,
    IncomingCallTemplateDeleteRequest,
    IncomingCallTemplateResponse,
    IncomingCallTemplateUpdate,
    ScenarioDeleteRequest,
    TemplateScenarioUpgradeRequest,
    TrainingScenarioCreate,
    TrainingScenarioDetailResponse,
    TrainingScenarioResponse,
    TrainingScenarioUpdate,
)
from s112.api.simulation_service import SimulationApplicationService
from s112.api.teacher.training_content.scenario_details import scenario_detail_response
from s112.common.enums import TemplateStatus, UserRole
from s112.domain.models import (
    CardTemplate,
    CardTemplateGeneration,
    IncomingCallTemplate,
    TrainingScenario,
    UserAccount,
)


router = APIRouter(prefix="/api/v1", tags=["teacher/training_content"])
ResponseModel = TypeVar("ResponseModel", bound=BaseModel)


def _assert_actor_identity(request: Request, user_id: uuid.UUID) -> None:
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, "principal", None)
        if principal is None or principal.user_id != user_id:
            raise HTTPException(status_code=403, detail="Teacher does not match token")


async def _require_teacher_or_administrator(
    session: AsyncSession, user_id: uuid.UUID
) -> UserAccount:
    user = await session.get(UserAccount, user_id)
    if user is None or user.is_blocked:
        raise HTTPException(status_code=404, detail="Teacher not found")
    if user.role not in {UserRole.TEACHER.value, UserRole.ADMINISTRATOR.value}:
        raise HTTPException(status_code=403, detail="Teacher access required")
    return user


async def _with_creator_names(
    session: AsyncSession, items: Sequence, response_type: type[ResponseModel]
) -> list[ResponseModel]:
    if not items:
        return []
    creator_ids = {item.created_by for item in items}
    names = dict((await session.execute(
        select(UserAccount.id, UserAccount.display_name).where(
            UserAccount.id.in_(creator_ids)
        )
    )).all())
    return [
        response_type.model_validate(item).model_copy(
            update={"created_by_name": names.get(item.created_by)}
        )
        for item in items
    ]


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
) -> CardTemplateResponse:
    request = with_acting_user(http_request, request, "created_by")
    try:
        async with session.begin():
            template = await service.create_template(session, request)
        return (await _with_creator_names(session, [template], CardTemplateResponse))[0]
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/card-templates", response_model=list[CardTemplateResponse])
async def list_card_templates(
    http_request: Request,
    active_only: bool = True,
    template_status: TemplateStatus | None = Query(default=None, alias="status"),
    user_id: uuid.UUID = Depends(header_user_id),
    session: AsyncSession = Depends(get_read_session),
) -> list[CardTemplateResponse]:
    _assert_actor_identity(http_request, user_id)
    actor = await _require_teacher_or_administrator(session, user_id)
    statement = select(CardTemplate)
    if active_only:
        statement = statement.where(CardTemplate.is_active.is_(True))
    if template_status is not None:
        statement = statement.where(CardTemplate.status == template_status.value)
    if actor.role != UserRole.ADMINISTRATOR.value:
        statement = statement.where(
            or_(
                CardTemplate.status == TemplateStatus.PUBLISHED.value,
                CardTemplate.created_by == user_id,
            )
        )
    templates = list(
        await session.scalars(
            statement.order_by(CardTemplate.name, CardTemplate.template_key, CardTemplate.version)
        )
    )
    return await _with_creator_names(session, templates, CardTemplateResponse)


@router.get("/card-templates/{template_id}", response_model=CardTemplateResponse)
async def get_card_template(
    template_id: uuid.UUID,
    http_request: Request,
    user_id: uuid.UUID = Depends(header_user_id),
    session: AsyncSession = Depends(get_read_session),
) -> CardTemplateResponse:
    _assert_actor_identity(http_request, user_id)
    actor = await _require_teacher_or_administrator(session, user_id)
    template = await session.get(CardTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Card template not found")
    if (
        actor.role != UserRole.ADMINISTRATOR.value
        and template.status != TemplateStatus.PUBLISHED.value
        and template.created_by != user_id
    ):
        raise HTTPException(status_code=403, detail="Only the template author can view it")
    return (await _with_creator_names(session, [template], CardTemplateResponse))[0]


@router.patch("/card-templates/{template_id}", response_model=CardTemplateResponse)
async def update_card_template(
    template_id: uuid.UUID,
    request: CardTemplateUpdate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> CardTemplateResponse:
    request = with_acting_user(http_request, request, "updated_by")
    try:
        async with session.begin():
            template = await service.update_template(session, template_id, request)
        return (await _with_creator_names(session, [template], CardTemplateResponse))[0]
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/card-template-generations",
    response_model=CardTemplateGenerationResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_card_template_generation(
    request: CardTemplateGenerationCreate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> CardTemplateGeneration:
    request = with_acting_user(http_request, request, "created_by")
    try:
        async with session.begin():
            return await service.create_card_template_generation(session, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.get(
    "/card-template-generations/{generation_id}",
    response_model=CardTemplateGenerationResponse,
)
async def get_card_template_generation(
    generation_id: uuid.UUID,
    http_request: Request,
    user_id: uuid.UUID = Depends(header_user_id),
    session: AsyncSession = Depends(get_write_session),
) -> CardTemplateGeneration:
    _assert_actor_identity(http_request, user_id)
    actor = await _require_teacher_or_administrator(session, user_id)
    generation = await session.get(CardTemplateGeneration, generation_id)
    if generation is None:
        raise HTTPException(status_code=404, detail="Card template generation not found")
    if actor.role != UserRole.ADMINISTRATOR.value and generation.created_by != user_id:
        raise HTTPException(status_code=403, detail="Only the generation author can view it")
    return generation


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
    request = with_acting_user(http_request, request, "deleted_by")
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
) -> list[TrainingScenarioResponse]:
    request = with_acting_user(http_request, request, "updated_by")
    try:
        async with session.begin():
            scenarios = await service.upgrade_card_template_scenarios(
                session, template_id, request
            )
        return await _with_creator_names(session, scenarios, TrainingScenarioResponse)
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
) -> IncomingCallTemplateResponse:
    request = with_acting_user(http_request, request, "created_by")
    try:
        async with session.begin():
            template = await service.create_incoming_call_template(session, request)
        return (await _with_creator_names(session, [template], IncomingCallTemplateResponse))[0]
    except DomainError as exc:
        raise_http_error(exc)


@router.get(
    "/incoming-call-templates",
    response_model=list[IncomingCallTemplateResponse],
)
async def list_incoming_call_templates(
    http_request: Request,
    active_only: bool = True,
    template_status: TemplateStatus | None = Query(default=None, alias="status"),
    user_id: uuid.UUID = Depends(header_user_id),
    session: AsyncSession = Depends(get_read_session),
) -> list[IncomingCallTemplateResponse]:
    _assert_actor_identity(http_request, user_id)
    actor = await _require_teacher_or_administrator(session, user_id)
    statement = select(IncomingCallTemplate)
    if active_only:
        statement = statement.where(IncomingCallTemplate.is_active.is_(True))
    if template_status is not None:
        statement = statement.where(IncomingCallTemplate.status == template_status.value)
    if actor.role != UserRole.ADMINISTRATOR.value:
        statement = statement.where(
            or_(
                IncomingCallTemplate.status == TemplateStatus.PUBLISHED.value,
                IncomingCallTemplate.created_by == user_id,
            )
        )
    templates = list(
        await session.scalars(
            statement.order_by(
                IncomingCallTemplate.name,
                IncomingCallTemplate.template_key,
                IncomingCallTemplate.version,
            )
        )
    )
    return await _with_creator_names(session, templates, IncomingCallTemplateResponse)


@router.get(
    "/incoming-call-templates/{template_id}",
    response_model=IncomingCallTemplateResponse,
)
async def get_incoming_call_template(
    template_id: uuid.UUID,
    http_request: Request,
    user_id: uuid.UUID = Depends(header_user_id),
    session: AsyncSession = Depends(get_read_session),
) -> IncomingCallTemplateResponse:
    _assert_actor_identity(http_request, user_id)
    actor = await _require_teacher_or_administrator(session, user_id)
    template = await session.get(IncomingCallTemplate, template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Incoming call template not found")
    if (
        actor.role != UserRole.ADMINISTRATOR.value
        and template.status != TemplateStatus.PUBLISHED.value
        and template.created_by != user_id
    ):
        raise HTTPException(status_code=403, detail="Only the template author can view it")
    return (await _with_creator_names(session, [template], IncomingCallTemplateResponse))[0]


@router.patch(
    "/incoming-call-templates/{template_id}",
    response_model=IncomingCallTemplateResponse,
)
async def update_incoming_call_template(
    template_id: uuid.UUID,
    request: IncomingCallTemplateUpdate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> IncomingCallTemplateResponse:
    request = with_acting_user(http_request, request, "updated_by")
    try:
        async with session.begin():
            template = await service.update_incoming_call_template(
                session, template_id, request
            )
        return (await _with_creator_names(session, [template], IncomingCallTemplateResponse))[0]
    except DomainError as exc:
        raise_http_error(exc)


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
    request = with_acting_user(http_request, request, "deleted_by")
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
) -> list[TrainingScenarioResponse]:
    request = with_acting_user(http_request, request, "updated_by")
    try:
        async with session.begin():
            scenarios = await service.upgrade_incoming_call_template_scenarios(
                session, template_id, request
            )
        return await _with_creator_names(session, scenarios, TrainingScenarioResponse)
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
) -> TrainingScenarioResponse:
    request = with_acting_user(http_request, request, "created_by")
    try:
        async with session.begin():
            scenario = await service.create_scenario(session, request)
        return (await _with_creator_names(session, [scenario], TrainingScenarioResponse))[0]
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/training-scenarios", response_model=list[TrainingScenarioResponse])
async def list_training_scenarios(
    http_request: Request,
    user_id: uuid.UUID = Depends(header_user_id),
    scenario_status: str | None = Query(default=None, alias="status"),
    difficulty: int | None = Query(default=None, ge=1, le=4),
    include_archived: bool = False,
    session: AsyncSession = Depends(get_read_session),
) -> list[TrainingScenarioResponse]:
    _assert_actor_identity(http_request, user_id)
    await _require_teacher_or_administrator(session, user_id)
    statement = select(TrainingScenario)
    if scenario_status:
        statement = statement.where(TrainingScenario.status == scenario_status)
    elif not include_archived:
        statement = statement.where(TrainingScenario.status != "ARCHIVED")
    if difficulty is not None:
        statement = statement.where(TrainingScenario.difficulty == difficulty)
    scenarios = list(await session.scalars(statement.order_by(TrainingScenario.name)))
    return await _with_creator_names(session, scenarios, TrainingScenarioResponse)


@router.get(
    "/training-scenarios/{scenario_id}", response_model=TrainingScenarioDetailResponse
)
async def get_training_scenario(
    scenario_id: uuid.UUID,
    http_request: Request,
    user_id: uuid.UUID = Depends(header_user_id),
    session: AsyncSession = Depends(get_read_session),
) -> TrainingScenarioDetailResponse:
    _assert_actor_identity(http_request, user_id)
    await _require_teacher_or_administrator(session, user_id)
    scenario = await session.get(TrainingScenario, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Training scenario not found")
    detail = await scenario_detail_response(session, scenario)
    return (await _with_creator_names(session, [detail], TrainingScenarioDetailResponse))[0]


@router.patch(
    "/training-scenarios/{scenario_id}", response_model=TrainingScenarioResponse
)
async def update_training_scenario(
    scenario_id: uuid.UUID,
    request: TrainingScenarioUpdate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingScenarioResponse:
    request = with_acting_user(http_request, request, "updated_by")
    try:
        async with session.begin():
            scenario = await service.update_scenario(session, scenario_id, request)
        return (await _with_creator_names(session, [scenario], TrainingScenarioResponse))[0]
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
    request = with_acting_user(http_request, request, "deleted_by")
    try:
        async with session.begin():
            await service.delete_scenario(session, scenario_id, request)
    except DomainError as exc:
        raise_http_error(exc)
