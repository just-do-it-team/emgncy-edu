import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
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
    TrainingScenarioCreate,
    TrainingScenarioResponse,
    TrainingScenarioUpdate,
)
from s112.api.simulation_service import SimulationApplicationService
from s112.domain.models import CardTemplate, IncomingCallTemplate, TrainingScenario


router = APIRouter(prefix="/api/v1", tags=["teacher/training_content"])


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


@router.delete(
    "/card-templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_card_template(
    template_id: uuid.UUID,
    request: CardTemplateDeleteRequest,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> None:
    try:
        async with session.begin():
            await service.delete_template(session, template_id, request)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/incoming-call-templates",
    response_model=IncomingCallTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_incoming_call_template(
    request: IncomingCallTemplateCreate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> IncomingCallTemplate:
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
    active_only: bool = True,
    session: AsyncSession = Depends(get_read_session),
) -> list[IncomingCallTemplate]:
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
    session: AsyncSession = Depends(get_read_session),
) -> IncomingCallTemplate:
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
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> None:
    try:
        async with session.begin():
            await service.delete_incoming_call_template(session, template_id, request)
    except DomainError as exc:
        raise_http_error(exc)


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
        statement = statement.where(TrainingScenario.status != "ARCHIVED")
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
