import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.dependencies import get_read_session
from s112.api.simulation_schemas import (
    ScheduledCardResponse,
    TrainingActionResponse,
    TrainingCallResponse,
)
from s112.common.enums import UserRole, WorkspaceMemberRole
from s112.domain.models import (
    AssignmentParticipant,
    ScenarioAssignment,
    SessionScheduledCard,
    SimulationWorkspace,
    TrainingAction,
    TrainingCall,
    TrainingSession,
    UserAccount,
    WorkspaceMember,
)


router = APIRouter(prefix="/api/v1", tags=["common/training"])


@router.get(
    "/training-sessions/{session_id}/actions",
    response_model=list[TrainingActionResponse],
)
async def list_training_actions(
    session_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> list[TrainingAction]:
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, "principal", None)
        if principal is None or principal.user_id != user_id:
            raise HTTPException(status_code=403, detail="User does not match token")
    user = await session.get(UserAccount, user_id)
    if user is None or user.is_blocked:
        raise HTTPException(status_code=403, detail="User access required")
    assignment = await session.scalar(
        select(ScenarioAssignment)
        .join(TrainingSession, TrainingSession.assignment_id == ScenarioAssignment.id)
        .where(TrainingSession.id == session_id)
    )
    if assignment is None:
        raise HTTPException(status_code=404, detail="Training session not found")
    if user.role == UserRole.TEACHER.value:
        allowed = assignment.assigned_by == user_id
    elif user.role == UserRole.STUDENT.value:
        allowed = await session.get(AssignmentParticipant, (assignment.id, user_id)) is not None
    else:
        allowed = user.role == UserRole.ADMINISTRATOR.value
    if not allowed:
        raise HTTPException(status_code=404, detail="Training session not found")
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
            .order_by(
                SessionScheduledCard.scheduled_at,
                SessionScheduledCard.scenario_card_key,
            )
        )
    )


@router.get(
    "/training-sessions/{session_id}/incoming-calls",
    response_model=list[TrainingCallResponse],
)
async def list_incoming_calls(
    session_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> list[TrainingCall]:
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, "principal", None)
        if principal is None or principal.user_id != user_id:
            raise HTTPException(status_code=403, detail="User does not match token")
    workspace = await session.scalar(
        select(SimulationWorkspace).where(
            SimulationWorkspace.training_session_id == session_id
        )
    )
    if workspace is None:
        raise HTTPException(status_code=404, detail="Training session not found")
    member = await session.get(WorkspaceMember, (workspace.id, user_id))
    if member is None or member.left_at is not None or (
        member.member_role == WorkspaceMemberRole.PARTICIPANT.value
        and member.position_code is not None
    ):
        raise HTTPException(status_code=403, detail="Operator 112 access is required")
    statement = select(TrainingCall).where(
        TrainingCall.training_session_id == session_id,
        TrainingCall.direction == "INBOUND",
    )
    if member.member_role == WorkspaceMemberRole.PARTICIPANT.value:
        statement = statement.where(
            or_(
                TrainingCall.assigned_operator_user_id == user_id,
                TrainingCall.assigned_operator_user_id.is_(None),
            )
        )
    return list(
        await session.scalars(
            statement.order_by(TrainingCall.scheduled_at, TrainingCall.scenario_item_key)
        )
    )
