import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from s112.api.dependencies import get_read_session
from s112.api.common.training.responses import student_training_history_item
from s112.api.simulation_schemas import (
    StudentTrainingHistoryItem,
    TrainingSessionResponse,
    TrainingSessionSummary,
)
from s112.api.student.training_history.schemas import StudentTrainingHistoryPage
from s112.common.enums import TrainingSessionStatus, UserRole
from s112.domain.models import (
    AssignmentBatch,
    AssignmentParticipant,
    LearningGroup,
    ScenarioAssignment,
    TrainingSession,
    UserAccount,
)


router = APIRouter(prefix="/api/v1", tags=["student/training_history"])


@router.get("/student/training-history", response_model=StudentTrainingHistoryPage)
async def get_own_training_history(
    student_id: uuid.UUID = Header(alias="X-User-Id"),
    session_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_read_session),
) -> StudentTrainingHistoryPage:
    student = await session.get(UserAccount, student_id)
    if student is None or student.is_blocked:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.role != UserRole.STUDENT.value:
        raise HTTPException(status_code=403, detail="Student access required")

    filters = [AssignmentParticipant.user_id == student_id]
    if session_status:
        filters.append(TrainingSession.status == session_status)
    total = int(
        await session.scalar(
            select(func.count())
            .select_from(TrainingSession)
            .join(
                ScenarioAssignment,
                ScenarioAssignment.id == TrainingSession.assignment_id,
            )
            .join(
                AssignmentParticipant,
                AssignmentParticipant.assignment_id == ScenarioAssignment.id,
            )
            .where(*filters)
        )
        or 0
    )
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
            .where(*filters)
            .order_by(TrainingSession.started_at.desc(), TrainingSession.id)
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return StudentTrainingHistoryPage(
        items=[
            student_training_history_item(training_session, assignment, group)
            for training_session, assignment, _batch, group in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/student/training-sessions/{session_id}/result",
    response_model=StudentTrainingHistoryItem,
)
async def get_own_training_result(
    session_id: uuid.UUID,
    response: Response,
    student_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> StudentTrainingHistoryItem:
    student = await session.get(UserAccount, student_id)
    if student is None or student.is_blocked:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.role != UserRole.STUDENT.value:
        raise HTTPException(status_code=403, detail="Student access required")

    row = (
        await session.execute(
            select(TrainingSession, ScenarioAssignment, LearningGroup)
            .join(ScenarioAssignment, ScenarioAssignment.id == TrainingSession.assignment_id)
            .join(
                AssignmentParticipant,
                AssignmentParticipant.assignment_id == ScenarioAssignment.id,
            )
            .outerjoin(AssignmentBatch, AssignmentBatch.id == ScenarioAssignment.assignment_batch_id)
            .outerjoin(LearningGroup, LearningGroup.id == AssignmentBatch.group_id)
            .where(TrainingSession.id == session_id, AssignmentParticipant.user_id == student_id)
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Training session not found")
    training_session, assignment, group = row
    if training_session.status not in {
        TrainingSessionStatus.COMPLETED.value,
        TrainingSessionStatus.ABORTED.value,
    }:
        raise HTTPException(status_code=409, detail="Training session is not completed")
    response.headers["Cache-Control"] = "no-store"
    return student_training_history_item(training_session, assignment, group)


@router.get("/training-sessions", response_model=list[TrainingSessionSummary])
async def list_training_sessions(
    assignment_id: uuid.UUID | None = None,
    participant_user_id: uuid.UUID | None = None,
    session_status: str | None = Query(default=None, alias="status"),
    session: AsyncSession = Depends(get_read_session),
) -> list[TrainingSessionSummary]:
    statement = select(TrainingSession).options(
        load_only(
            TrainingSession.id,
            TrainingSession.assignment_id,
            TrainingSession.attempt_number,
            TrainingSession.status,
            TrainingSession.completion_policy,
            TrainingSession.started_at,
            TrainingSession.completed_at,
            TrainingSession.score,
            TrainingSession.passed,
            TrainingSession.expert_score,
            TrainingSession.expert_passed,
            TrainingSession.expert_evaluated_at,
        )
    )
    if assignment_id is not None:
        statement = statement.where(TrainingSession.assignment_id == assignment_id)
    if participant_user_id is not None:
        statement = statement.join(
            AssignmentParticipant,
            AssignmentParticipant.assignment_id == TrainingSession.assignment_id,
        ).where(AssignmentParticipant.user_id == participant_user_id)
    if session_status:
        statement = statement.where(TrainingSession.status == session_status)
    training_sessions = list(
        await session.scalars(statement.order_by(TrainingSession.started_at.desc()))
    )
    return [TrainingSessionSummary.model_validate(item) for item in training_sessions]


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
