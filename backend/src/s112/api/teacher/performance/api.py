import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.common.dependencies import raise_http_error, simulation_service
from s112.api.identity import acting_user_id, with_acting_user
from s112.api.common.training.responses import student_training_history_item
from s112.api.dependencies import get_read_session, get_write_session
from s112.api.service import DomainError
from s112.api.simulation_schemas import (
    ExpertAssessmentUpdate,
    ExpertReviewContextResponse,
    StudentTrainingHistoryItem,
    TrainingSessionResponse,
)
from s112.api.simulation_service import SimulationApplicationService
from s112.common.enums import UserRole
from s112.domain.models import (
    AssignmentBatch,
    AssignmentParticipant,
    LearningGroup,
    ScenarioAssignment,
    TrainingSession,
)


router = APIRouter(prefix='/api/v1', tags=['teacher/performance'])


def _assert_teacher_identity(request: Request, teacher_id: uuid.UUID) -> None:
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, 'principal', None)
        if principal is None or principal.user_id != teacher_id:
            raise HTTPException(status_code=403, detail='Teacher does not match token')


@router.get(
    '/students/{student_id}/training-history',
    response_model=list[StudentTrainingHistoryItem],
)
async def get_student_training_history(
    student_id: uuid.UUID,
    http_request: Request,
    teacher_id: uuid.UUID | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    session: AsyncSession = Depends(get_read_session),
) -> list[StudentTrainingHistoryItem]:
    teacher_id = acting_user_id(http_request, teacher_id)
    if http_request.app.state.auth_settings.enabled and http_request.state.principal.role not in {
        UserRole.TEACHER,
        UserRole.ADMINISTRATOR,
    }:
        raise HTTPException(status_code=403, detail="Teacher access required")
    _assert_teacher_identity(http_request, teacher_id)
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
        student_training_history_item(training_session, assignment, group)
        for training_session, assignment, _batch, group in rows
    ]


@router.get(
    '/training-sessions/{session_id}/expert-review-context',
    response_model=ExpertReviewContextResponse,
)
async def get_expert_review_context(
    session_id: uuid.UUID,
    http_request: Request,
    teacher_id: uuid.UUID | None = None,
    session: AsyncSession = Depends(get_read_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> dict:
    teacher_id = acting_user_id(http_request, teacher_id)
    _assert_teacher_identity(http_request, teacher_id)
    try:
        return await service.build_expert_review_context(
            session, session_id, teacher_id
        )
    except DomainError as exc:
        raise_http_error(exc)


@router.put(
    '/training-sessions/{session_id}/expert-assessment',
    response_model=TrainingSessionResponse,
)
async def update_expert_assessment(
    session_id: uuid.UUID,
    request: ExpertAssessmentUpdate,
    http_request: Request,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> TrainingSession:
    request = with_acting_user(http_request, request, "teacher_id")
    try:
        async with session.begin():
            return await service.update_expert_assessment(
                session, session_id, request
            )
    except DomainError as exc:
        raise_http_error(exc)
