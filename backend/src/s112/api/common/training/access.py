import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.auth.principal import Principal
from s112.common.enums import UserRole
from s112.domain.models import AssignmentParticipant, ScenarioAssignment, TrainingSession


async def can_read_training_session(
    session: AsyncSession, session_id: uuid.UUID, principal: Principal
) -> bool:
    if principal.role is UserRole.ADMINISTRATOR:
        return await session.get(TrainingSession, session_id) is not None
    assignment = await session.scalar(
        select(ScenarioAssignment)
        .join(TrainingSession, TrainingSession.assignment_id == ScenarioAssignment.id)
        .where(TrainingSession.id == session_id)
    )
    if assignment is None:
        return False
    if principal.role is UserRole.TEACHER:
        return assignment.assigned_by == principal.user_id
    if principal.role is UserRole.STUDENT:
        return await session.get(
            AssignmentParticipant, (assignment.id, principal.user_id)
        ) is not None
    return False
