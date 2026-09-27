import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.common.training.responses import assignment_response
from s112.api.dependencies import get_read_session
from s112.api.simulation_schemas import ScenarioAssignmentResponse
from s112.common.enums import UserRole
from s112.domain.models import (
    AssignmentBatch,
    AssignmentParticipant,
    ScenarioAssignment,
    UserAccount,
)


router = APIRouter(prefix="/api/v1", tags=["common/training"])


@router.get("/scenario-assignments", response_model=list[ScenarioAssignmentResponse])
async def list_scenario_assignments(
    request: Request,
    participant_user_id: uuid.UUID | None = None,
    group_id: uuid.UUID | None = None,
    assigned_by: uuid.UUID | None = None,
    assignment_status: str | None = Query(default=None, alias="status"),
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> list[ScenarioAssignmentResponse]:
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, "principal", None)
        if principal is None or principal.user_id != user_id:
            raise HTTPException(status_code=403, detail="User does not match token")
    user = await session.get(UserAccount, user_id)
    if user is None or user.is_blocked:
        raise HTTPException(status_code=403, detail="User access required")
    statement = select(ScenarioAssignment)
    if user.role == UserRole.TEACHER.value:
        if assigned_by is not None and assigned_by != user_id:
            raise HTTPException(status_code=403, detail="Teacher does not own these assignments")
        statement = statement.where(ScenarioAssignment.assigned_by == user_id)
    elif user.role == UserRole.STUDENT.value:
        if participant_user_id is not None and participant_user_id != user_id:
            raise HTTPException(status_code=403, detail="Student can only list own assignments")
        participant_user_id = user_id
    elif user.role != UserRole.ADMINISTRATOR.value:
        raise HTTPException(status_code=403, detail="User access required")
    if participant_user_id is not None:
        statement = statement.join(
            AssignmentParticipant,
            AssignmentParticipant.assignment_id == ScenarioAssignment.id,
        ).where(AssignmentParticipant.user_id == participant_user_id)
    if group_id is not None:
        statement = statement.join(
            AssignmentBatch,
            AssignmentBatch.id == ScenarioAssignment.assignment_batch_id,
        ).where(AssignmentBatch.group_id == group_id)
    if assigned_by is not None:
        statement = statement.where(ScenarioAssignment.assigned_by == assigned_by)
    if assignment_status:
        statement = statement.where(ScenarioAssignment.status == assignment_status)
    assignments = list(
        await session.scalars(statement.order_by(ScenarioAssignment.created_at.desc()))
    )
    return [await assignment_response(session, assignment) for assignment in assignments]
