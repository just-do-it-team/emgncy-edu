import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.common.enums import UserRole
from s112.domain.models import (
    AssignmentParticipant,
    ScenarioAssignment,
    TrainingCall,
    TrainingSession,
    UserAccount,
)


async def can_access_training_call(
    session: AsyncSession, call: TrainingCall, user_id: uuid.UUID
) -> bool:
    user = await session.get(UserAccount, user_id)
    if user is None or user.is_blocked:
        return False
    assignment = await session.scalar(
        select(ScenarioAssignment)
        .join(TrainingSession, TrainingSession.assignment_id == ScenarioAssignment.id)
        .where(TrainingSession.id == call.training_session_id)
    )
    if assignment is None:
        return False
    if user.role == UserRole.STUDENT.value:
        participant = await session.get(AssignmentParticipant, (assignment.id, user_id))
        return participant is not None and user_id in {
            call.operator_user_id,
            call.assigned_operator_user_id,
        }
    return user.role == UserRole.ADMINISTRATOR.value or (
        user.role == UserRole.TEACHER.value
        and assignment.assigned_by == user_id
    )
