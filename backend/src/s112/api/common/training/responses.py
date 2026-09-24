from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.simulation_schemas import (
    AssignmentBatchResponse,
    AssignmentParticipantResponse,
    LearningGroupMemberResponse,
    LearningGroupResponse,
    ScenarioAssignmentResponse,
    StudentTrainingHistoryItem,
    TeacherMonitoringParticipant,
    TeacherMonitoringSession,
)
from s112.common.enums import (
    ScheduledCardStatus,
    TrainingActionResult,
    TrainingCallStatus,
)
from s112.domain.models import (
    AssignmentBatch,
    AssignmentParticipant,
    LearningGroup,
    LearningGroupMember,
    ScenarioAssignment,
    SessionScheduledCard,
    SimulationWorkspace,
    TrainingAction,
    TrainingCall,
    TrainingSession,
    UserAccount,
)


async def assignment_response(
    session: AsyncSession, assignment: ScenarioAssignment
) -> ScenarioAssignmentResponse:
    participants = list(
        await session.scalars(
            select(AssignmentParticipant)
            .where(AssignmentParticipant.assignment_id == assignment.id)
            .order_by(AssignmentParticipant.user_id)
        )
    )
    return ScenarioAssignmentResponse(
        id=assignment.id,
        scenario_id=assignment.scenario_id,
        scenario_name=str(assignment.scenario_snapshot.get("name", "")),
        scenario_revision=assignment.scenario_revision,
        assignment_batch_id=assignment.assignment_batch_id,
        assigned_by=assignment.assigned_by,
        workspace_mode=assignment.workspace_mode,
        launch_policy=assignment.launch_policy,
        max_attempts=assignment.max_attempts,
        status=assignment.status,
        available_from=assignment.available_from,
        due_at=assignment.due_at,
        created_at=assignment.created_at,
        participants=[AssignmentParticipantResponse.model_validate(item) for item in participants],
    )


async def learning_group_response(
    session: AsyncSession, group: LearningGroup
) -> LearningGroupResponse:
    rows = (
        await session.execute(
            select(LearningGroupMember, UserAccount)
            .join(UserAccount, UserAccount.id == LearningGroupMember.student_id)
            .where(LearningGroupMember.group_id == group.id)
            .order_by(UserAccount.display_name, UserAccount.id)
        )
    ).all()
    return LearningGroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        teacher_id=group.teacher_id,
        is_active=group.is_active,
        created_at=group.created_at,
        updated_at=group.updated_at,
        members=[
            LearningGroupMemberResponse(
                student_id=member.student_id,
                display_name=user.display_name,
                joined_at=member.joined_at,
                removed_at=member.removed_at,
            )
            for member, user in rows
        ],
    )


async def assignment_batch_response(
    session: AsyncSession,
    batch: AssignmentBatch,
    assignments: list[ScenarioAssignment] | None = None,
) -> AssignmentBatchResponse:
    if assignments is None:
        assignments = list(
            await session.scalars(
                select(ScenarioAssignment)
                .where(ScenarioAssignment.assignment_batch_id == batch.id)
                .order_by(ScenarioAssignment.created_at, ScenarioAssignment.id)
            )
        )
    return AssignmentBatchResponse(
        id=batch.id,
        group_id=batch.group_id,
        scenario_id=batch.scenario_id,
        assigned_by=batch.assigned_by,
        launch_policy=batch.launch_policy,
        max_attempts=batch.max_attempts,
        available_from=batch.available_from,
        due_at=batch.due_at,
        created_at=batch.created_at,
        assignments=[
            await assignment_response(session, assignment)
            for assignment in assignments
        ],
    )


def student_training_history_item(
    training_session: TrainingSession,
    assignment: ScenarioAssignment,
    group: LearningGroup | None,
) -> StudentTrainingHistoryItem:
    return StudentTrainingHistoryItem(
        session_id=training_session.id,
        assignment_id=assignment.id,
        assignment_batch_id=assignment.assignment_batch_id,
        group_id=group.id if group else None,
        group_name=group.name if group else None,
        scenario_id=assignment.scenario_id,
        scenario_name=str(assignment.scenario_snapshot.get("name", "")),
        attempt_number=training_session.attempt_number,
        status=training_session.status,
        started_at=training_session.started_at,
        completed_at=training_session.completed_at,
        automatic_score=training_session.score,
        automatic_passed=training_session.passed,
        automatic_result=(
            training_session.result
            if training_session.status in {"COMPLETED", "ABORTED"}
            else {}
        ),
        expert_score=training_session.expert_score,
        expert_passed=training_session.expert_passed,
        final_score=(
            training_session.expert_score
            if training_session.expert_score is not None
            else training_session.score
        ),
        final_passed=(
            training_session.expert_passed
            if training_session.expert_passed is not None
            else training_session.passed
        ),
        expert_comment=training_session.expert_comment,
        expert_evaluated_by=training_session.expert_evaluated_by,
        expert_evaluated_at=training_session.expert_evaluated_at,
    )


async def teacher_monitoring_response(
    session: AsyncSession,
    training_session: TrainingSession,
    assignment: ScenarioAssignment,
    workspace: SimulationWorkspace,
) -> TeacherMonitoringSession:
    group: LearningGroup | None = None
    if assignment.assignment_batch_id is not None:
        batch = await session.get(AssignmentBatch, assignment.assignment_batch_id)
        if batch is not None:
            group = await session.get(LearningGroup, batch.group_id)
    participant_rows = (
        await session.execute(
            select(AssignmentParticipant, UserAccount)
            .join(UserAccount, UserAccount.id == AssignmentParticipant.user_id)
            .where(AssignmentParticipant.assignment_id == assignment.id)
            .order_by(UserAccount.display_name, UserAccount.id)
        )
    ).all()
    scheduled_cards = list(
        await session.scalars(
            select(SessionScheduledCard)
            .where(SessionScheduledCard.training_session_id == training_session.id)
            .order_by(SessionScheduledCard.scenario_card_key)
        )
    )
    training_calls = list(
        await session.scalars(
            select(TrainingCall)
            .where(TrainingCall.training_session_id == training_session.id)
            .order_by(TrainingCall.scenario_item_key)
        )
    )
    successful_actions = int(
        await session.scalar(
            select(func.count())
            .select_from(TrainingAction)
            .where(
                TrainingAction.training_session_id == training_session.id,
                TrainingAction.result == TrainingActionResult.SUCCESS.value,
            )
        )
        or 0
    )
    rejected_actions = int(
        await session.scalar(
            select(func.count())
            .select_from(TrainingAction)
            .where(
                TrainingAction.training_session_id == training_session.id,
                TrainingAction.result == TrainingActionResult.REJECTED.value,
            )
        )
        or 0
    )
    last_activity_at = await session.scalar(
        select(func.max(TrainingAction.occurred_at)).where(
            TrainingAction.training_session_id == training_session.id
        )
    )
    return TeacherMonitoringSession(
        session_id=training_session.id,
        assignment_id=assignment.id,
        assignment_batch_id=assignment.assignment_batch_id,
        group_id=group.id if group else None,
        group_name=group.name if group else None,
        scenario_id=assignment.scenario_id,
        scenario_name=str(assignment.scenario_snapshot.get("name", "")),
        workspace_id=workspace.id,
        status=training_session.status,
        attempt_number=training_session.attempt_number,
        started_at=training_session.started_at,
        completed_at=training_session.completed_at,
        score=training_session.score,
        passed=training_session.passed,
        cards_total=len(scheduled_cards),
        cards_pending=sum(
            item.status == ScheduledCardStatus.PENDING.value for item in scheduled_cards
        ),
        cards_emitted=sum(
            item.status == ScheduledCardStatus.EMITTED.value for item in scheduled_cards
        ),
        calls_total=len(training_calls),
        calls_pending=sum(
            item.status == TrainingCallStatus.PENDING.value for item in training_calls
        ),
        calls_ringing=sum(
            item.status == TrainingCallStatus.RINGING.value for item in training_calls
        ),
        calls_active=sum(
            item.status == TrainingCallStatus.ACTIVE.value for item in training_calls
        ),
        calls_completed=sum(
            item.status == TrainingCallStatus.COMPLETED.value for item in training_calls
        ),
        pending_card_keys=[
            item.scenario_card_key
            for item in scheduled_cards
            if item.status == ScheduledCardStatus.PENDING.value
        ],
        emitted_card_keys=[
            item.scenario_card_key
            for item in scheduled_cards
            if item.status == ScheduledCardStatus.EMITTED.value
        ],
        successful_actions=successful_actions,
        rejected_actions=rejected_actions,
        last_activity_at=last_activity_at,
        participants=[
            TeacherMonitoringParticipant(
                user_id=participant.user_id,
                display_name=user.display_name,
                status=participant.status,
                position_code=participant.position_code,
                participant_role=participant.participant_role,
            )
            for participant, user in participant_rows
        ],
    )
