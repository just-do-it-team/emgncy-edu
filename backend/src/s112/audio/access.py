import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.common.enums import UserRole, WorkspaceMemberRole
from s112.domain.models import (
    AssignmentParticipant,
    CardService,
    EmergencyService,
    ScenarioAssignment,
    TrainingCall,
    TrainingSession,
    UserAccount,
    WorkspaceMember,
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
        if participant is None or user_id not in {
            call.operator_user_id,
            call.assigned_operator_user_id,
        }:
            return False
        if call.direction == "OUTBOUND":
            member = await session.get(WorkspaceMember, (call.workspace_id, user_id))
            if (
                member is None
                or member.left_at is not None
                or member.member_role != WorkspaceMemberRole.PARTICIPANT.value
                or member.position_code is None
            ):
                return False
            visible_service = await session.scalar(
                select(CardService.id)
                .join(EmergencyService, EmergencyService.id == CardService.service_id)
                .where(
                    CardService.card_id == call.incident_card_id,
                    CardService.is_active.is_(True),
                    EmergencyService.code == member.position_code,
                    EmergencyService.is_active.is_(True),
                )
                .limit(1)
            )
            return visible_service is not None
        return True
    return user.role == UserRole.ADMINISTRATOR.value or (
        user.role == UserRole.TEACHER.value
        and assignment.assigned_by == user_id
    )
