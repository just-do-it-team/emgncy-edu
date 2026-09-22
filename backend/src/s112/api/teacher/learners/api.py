import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.common.dependencies import raise_http_error, simulation_service
from s112.api.common.training.responses import (
    assignment_batch_response,
    assignment_response,
    learning_group_response,
)
from s112.api.dependencies import get_read_session, get_write_session
from s112.api.service import DomainError
from s112.api.simulation_schemas import (
    AssignmentBatchResponse,
    GroupScenarioAssignmentCreate,
    LearningGroupCreate,
    LearningGroupMembersUpdate,
    LearningGroupResponse,
    LearningGroupUpdate,
    ScenarioAssignmentCreate,
    ScenarioAssignmentResponse,
)
from s112.api.simulation_service import SimulationApplicationService
from s112.api.teacher.learners.schemas import (
    StudentGroupSummary,
    TeacherStudentListItem,
    TeacherStudentPage,
)
from s112.common.enums import UserRole
from s112.domain.models import (
    AssignmentParticipant,
    LearningGroup,
    LearningGroupMember,
    ScenarioAssignment,
    UserAccount,
)


router = APIRouter(prefix="/api/v1", tags=["teacher/learners"])


@router.get("/students", response_model=TeacherStudentPage)
async def list_students(
    teacher_id: uuid.UUID,
    group_id: uuid.UUID | None = None,
    search: str | None = Query(default=None, min_length=1, max_length=100),
    include_blocked: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_read_session),
) -> TeacherStudentPage:
    teacher = await session.get(UserAccount, teacher_id)
    if teacher is None or teacher.is_blocked:
        raise HTTPException(status_code=404, detail="Teacher not found")
    if teacher.role not in {UserRole.TEACHER.value, UserRole.ADMINISTRATOR.value}:
        raise HTTPException(status_code=403, detail="Teacher access required")

    active_group_membership = (
        select(LearningGroupMember.student_id)
        .join(LearningGroup, LearningGroup.id == LearningGroupMember.group_id)
        .where(
            LearningGroupMember.student_id == UserAccount.id,
            LearningGroupMember.removed_at.is_(None),
            LearningGroup.teacher_id == teacher_id,
        )
        .correlate(UserAccount)
        .exists()
    )
    teacher_assignment = (
        select(AssignmentParticipant.user_id)
        .join(
            ScenarioAssignment,
            ScenarioAssignment.id == AssignmentParticipant.assignment_id,
        )
        .where(
            AssignmentParticipant.user_id == UserAccount.id,
            ScenarioAssignment.assigned_by == teacher_id,
        )
        .correlate(UserAccount)
        .exists()
    )
    filters = [
        UserAccount.role == UserRole.STUDENT.value,
        or_(active_group_membership, teacher_assignment),
    ]
    if group_id is not None:
        filters[-1] = (
            select(LearningGroupMember.student_id)
            .join(LearningGroup, LearningGroup.id == LearningGroupMember.group_id)
            .where(
                LearningGroupMember.student_id == UserAccount.id,
                LearningGroupMember.group_id == group_id,
                LearningGroupMember.removed_at.is_(None),
                LearningGroup.teacher_id == teacher_id,
            )
            .correlate(UserAccount)
            .exists()
        )
    if not include_blocked:
        filters.append(UserAccount.is_blocked.is_(False))
    if search:
        pattern = f"%{search.strip().lower()}%"
        filters.append(
            or_(
                func.lower(UserAccount.username).like(pattern),
                func.lower(UserAccount.display_name).like(pattern),
                func.lower(UserAccount.email).like(pattern),
            )
        )

    total = int(
        await session.scalar(
            select(func.count()).select_from(UserAccount).where(*filters)
        )
        or 0
    )
    students = list(
        await session.scalars(
            select(UserAccount)
            .where(*filters)
            .order_by(UserAccount.display_name, UserAccount.id)
            .limit(limit)
            .offset(offset)
        )
    )
    groups_by_student: dict[uuid.UUID, list[StudentGroupSummary]] = {
        student.id: [] for student in students
    }
    if students:
        group_rows = (
            await session.execute(
                select(LearningGroupMember.student_id, LearningGroup)
                .join(LearningGroup, LearningGroup.id == LearningGroupMember.group_id)
                .where(
                    LearningGroupMember.student_id.in_(groups_by_student),
                    LearningGroupMember.removed_at.is_(None),
                    LearningGroup.teacher_id == teacher_id,
                )
                .order_by(LearningGroup.name, LearningGroup.id)
            )
        ).all()
        for student_id, group in group_rows:
            groups_by_student[student_id].append(
                StudentGroupSummary(id=group.id, name=group.name)
            )

    return TeacherStudentPage(
        items=[
            TeacherStudentListItem(
                id=student.id,
                username=student.username,
                display_name=student.display_name,
                is_blocked=student.is_blocked,
                groups=groups_by_student[student.id],
            )
            for student in students
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/learning-groups",
    response_model=LearningGroupResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_learning_group(
    request: LearningGroupCreate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> LearningGroupResponse:
    try:
        async with session.begin():
            group = await service.create_learning_group(session, request)
        return await learning_group_response(session, group)
    except DomainError as exc:
        raise_http_error(exc)


@router.get("/learning-groups", response_model=list[LearningGroupResponse])
async def list_learning_groups(
    teacher_id: uuid.UUID,
    active_only: bool = True,
    session: AsyncSession = Depends(get_read_session),
) -> list[LearningGroupResponse]:
    statement = select(LearningGroup).where(LearningGroup.teacher_id == teacher_id)
    if active_only:
        statement = statement.where(LearningGroup.is_active.is_(True))
    groups = list(await session.scalars(statement.order_by(LearningGroup.name)))
    return [await learning_group_response(session, group) for group in groups]


@router.get("/learning-groups/{group_id}", response_model=LearningGroupResponse)
async def get_learning_group(
    group_id: uuid.UUID,
    session: AsyncSession = Depends(get_read_session),
) -> LearningGroupResponse:
    group = await session.get(LearningGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Learning group not found")
    return await learning_group_response(session, group)


@router.patch("/learning-groups/{group_id}", response_model=LearningGroupResponse)
async def update_learning_group(
    group_id: uuid.UUID,
    request: LearningGroupUpdate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> LearningGroupResponse:
    try:
        async with session.begin():
            group = await service.update_learning_group(session, group_id, request)
        return await learning_group_response(session, group)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/learning-groups/{group_id}/members",
    response_model=LearningGroupResponse,
)
async def add_learning_group_members(
    group_id: uuid.UUID,
    request: LearningGroupMembersUpdate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> LearningGroupResponse:
    try:
        async with session.begin():
            group = await service.add_learning_group_members(session, group_id, request)
        return await learning_group_response(session, group)
    except DomainError as exc:
        raise_http_error(exc)


@router.delete(
    "/learning-groups/{group_id}/members/{student_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_learning_group_member(
    group_id: uuid.UUID,
    student_id: uuid.UUID,
    actor_id: uuid.UUID,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> None:
    try:
        async with session.begin():
            await service.remove_learning_group_member(
                session, group_id, student_id, actor_id
            )
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/learning-groups/{group_id}/scenario-assignments",
    response_model=AssignmentBatchResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_learning_group_assignment(
    group_id: uuid.UUID,
    request: GroupScenarioAssignmentCreate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> AssignmentBatchResponse:
    try:
        async with session.begin():
            batch, assignments = await service.create_group_assignment(
                session, group_id, request
            )
        return await assignment_batch_response(session, batch, assignments)
    except DomainError as exc:
        raise_http_error(exc)


@router.post(
    "/scenario-assignments",
    response_model=ScenarioAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_scenario_assignment(
    request: ScenarioAssignmentCreate,
    session: AsyncSession = Depends(get_write_session),
    service: SimulationApplicationService = Depends(simulation_service),
) -> ScenarioAssignmentResponse:
    try:
        async with session.begin():
            assignment = await service.create_assignment(session, request)
        return await assignment_response(session, assignment)
    except DomainError as exc:
        raise_http_error(exc)
