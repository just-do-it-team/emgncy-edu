from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.service import ConflictError, NotFoundError, ValidationError
from s112.api.procedural import procedural_card_work_finished
from s112.common.enums import (
    AudioMessageKind,
    AudioMessageStatus,
    ProceduralGenerationStatus,
    ScheduledCardStatus,
    TrainingActionResult,
    TrainingCallStatus,
    TrainingSessionStatus,
    WorkspaceMemberRole,
    WorkspaceMode,
)
from s112.domain.models import (
    AudioMessage,
    CardService,
    EmergencyService,
    OutboxEvent,
    ScenarioAssignment,
    SessionScheduledCard,
    SimulationWorkspace,
    TrainingAction,
    TrainingCall,
    TrainingSession,
    WorkspaceMember,
)
from s112.semantic_evaluation.rules import (
    EVALUATION_REQUESTED_ACTION,
    EVALUATION_RESULT_ACTION,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


class CompletionNotReadyError(ConflictError):
    def __init__(self, readiness: dict[str, Any]) -> None:
        super().__init__("Training session is not ready to complete")
        self.http_detail = {
            "message": str(self),
            "completion_readiness": readiness,
        }


class ScenarioCompletionService:
    """Calculates and publishes the canonical completion state of a session."""

    def __init__(self, topic: str = "card.events") -> None:
        self.topic = topic

    async def get_for_user(
        self,
        session: AsyncSession,
        session_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> dict[str, Any]:
        training_session = await session.get(TrainingSession, session_id)
        if training_session is None:
            raise NotFoundError("Training session not found")
        workspace = await self._workspace(session, training_session.id)
        member = await session.get(WorkspaceMember, (workspace.id, user_id))
        if member is None or member.left_at is not None:
            raise ValidationError("User is not a member of this workspace")
        return await self.calculate(session, training_session, workspace=workspace)

    async def calculate(
        self,
        session: AsyncSession,
        training_session: TrainingSession,
        *,
        workspace: SimulationWorkspace | None = None,
    ) -> dict[str, Any]:
        workspace = workspace or await self._workspace(session, training_session.id)
        scheduled_cards = list(
            await session.scalars(
                select(SessionScheduledCard)
                .where(
                    SessionScheduledCard.training_session_id == training_session.id
                )
                .order_by(SessionScheduledCard.scenario_card_key)
            )
        )

        pending = [
            item
            for item in scheduled_cards
            if item.status == ScheduledCardStatus.PENDING.value
        ]
        emitted = [
            item
            for item in scheduled_cards
            if item.status == ScheduledCardStatus.EMITTED.value
        ]
        failed = [
            item
            for item in scheduled_cards
            if item.status == ScheduledCardStatus.FAILED.value
        ]
        cancelled = [
            item
            for item in scheduled_cards
            if item.status == ScheduledCardStatus.CANCELLED.value
        ]
        training_calls = list(
            await session.scalars(
                select(TrainingCall)
                .where(TrainingCall.training_session_id == training_session.id)
                .order_by(TrainingCall.scenario_item_key)
            )
        )
        calls_by_status = {
            status.value: [item for item in training_calls if item.status == status.value]
            for status in TrainingCallStatus
        }

        audio_messages = list(
            await session.scalars(
                select(AudioMessage)
                .where(AudioMessage.training_session_id == training_session.id)
                .order_by(AudioMessage.sequence_no)
            )
        )
        pending_audio = [
            message
            for message in audio_messages
            if message.status
            in {
                AudioMessageStatus.QUEUED.value,
                AudioMessageStatus.PROCESSING.value,
            }
            or (
                message.kind == AudioMessageKind.STT.value
                and message.status == AudioMessageStatus.COMPLETED.value
                and message.action_recorded_at is None
            )
        ]
        failed_audio = [
            message
            for message in audio_messages
            if message.status == AudioMessageStatus.FAILED.value
        ]

        semantic_actions = list(
            await session.scalars(
                select(TrainingAction)
                .where(
                    TrainingAction.training_session_id == training_session.id,
                    TrainingAction.action_type.in_(
                        [EVALUATION_REQUESTED_ACTION, EVALUATION_RESULT_ACTION]
                    ),
                )
                .order_by(TrainingAction.occurred_at)
            )
        )
        evaluation_requests = {
            action.entity_id: action
            for action in semantic_actions
            if action.action_type == EVALUATION_REQUESTED_ACTION
            and action.entity_id is not None
        }
        evaluation_results = {
            action.entity_id: action
            for action in semantic_actions
            if action.action_type == EVALUATION_RESULT_ACTION
            and action.entity_id is not None
        }
        pending_evaluations = [
            action
            for message_id, action in evaluation_requests.items()
            if message_id not in evaluation_results
        ]
        failed_evaluations = [
            action
            for action in evaluation_results.values()
            if action.result == TrainingActionResult.ERROR.value
        ]

        blockers: list[dict[str, Any]] = []
        generation_state = dict(training_session.generation_state or {})
        generation_status = generation_state.get("status")
        if generation_status == ProceduralGenerationStatus.RUNNING.value:
            blockers.append(
                {
                    "code": "PROCEDURAL_GENERATION_RUNNING",
                    "message": "Procedural scenario has not generated all cards yet",
                }
            )
        elif generation_status == ProceduralGenerationStatus.FAILED.value:
            blockers.append(
                {
                    "code": "PROCEDURAL_GENERATION_FAILED",
                    "message": generation_state.get(
                        "last_error", "Procedural scenario generation failed"
                    ),
                }
            )
        for item in pending:
            blockers.append(
                {
                    "code": "SCENARIO_CARD_PENDING",
                    "message": "A scenario card has not been emitted yet",
                    "scenario_card_key": item.scenario_card_key,
                }
            )
        for item in failed:
            blockers.append(
                {
                    "code": "SCENARIO_CARD_FAILED",
                    "message": "A scenario card could not be emitted",
                    "scenario_card_key": item.scenario_card_key,
                }
            )
        for item in cancelled:
            blockers.append(
                {
                    "code": "SCENARIO_CARD_CANCELLED",
                    "message": "A scenario card was cancelled",
                    "scenario_card_key": item.scenario_card_key,
                }
            )
        for item in emitted:
            if item.incident_card_id is None:
                blockers.append(
                    {
                        "code": "EMITTED_CARD_MISSING_INCIDENT",
                        "message": "An emitted scenario card has no incident card",
                        "scenario_card_key": item.scenario_card_key,
                    }
                )
            elif (
                item.generator_key is not None
                and not await procedural_card_work_finished(session, item)
            ):
                blockers.append(
                    {
                        "code": "GENERATED_CARD_ACTIONS_PENDING",
                        "message": "A generated card still requires trainee actions",
                        "scenario_card_key": item.scenario_card_key,
                        "incident_card_id": str(item.incident_card_id),
                    }
                )

        for item in training_calls:
            if item.status == TrainingCallStatus.COMPLETED.value:
                if item.direction == "INBOUND" and item.incident_card_id is None:
                    blockers.append(
                        {
                            "code": "COMPLETED_CALL_MISSING_INCIDENT_CARD",
                            "message": "A completed incoming call has no incident card",
                            "scenario_item_key": item.scenario_item_key,
                            "training_call_id": str(item.id),
                        }
                    )
                continue
            call_kind = "OUTGOING_CALL" if item.direction == "OUTBOUND" else "INCOMING_CALL"
            blockers.append(
                {
                    "code": f"{call_kind}_{item.status}",
                    "message": "A training call has not been completed successfully",
                    "scenario_item_key": item.scenario_item_key,
                    "training_call_id": str(item.id),
                }
            )

        for message in pending_audio:
            blockers.append(
                {
                    "code": "AUDIO_PROCESSING_PENDING",
                    "message": "An audio message has not finished processing",
                    "incident_card_id": (
                        str(message.incident_card_id)
                        if message.incident_card_id
                        else None
                    ),
                    "audio_message_id": str(message.id),
                    "sequence_no": message.sequence_no,
                }
            )
        for action in pending_evaluations:
            blockers.append(
                {
                    "code": "SEMANTIC_EVALUATION_PENDING",
                    "message": "An outbound call is waiting for semantic evaluation",
                    "incident_card_id": (
                        str(action.incident_card_id)
                        if action.incident_card_id
                        else None
                    ),
                    "audio_message_id": action.entity_id,
                    "sequence_no": action.details.get("sequence_no"),
                }
            )

        position_codes = set(
            await session.scalars(
                select(WorkspaceMember.position_code).where(
                    WorkspaceMember.workspace_id == workspace.id,
                    WorkspaceMember.member_role
                    == WorkspaceMemberRole.PARTICIPANT.value,
                    WorkspaceMember.left_at.is_(None),
                    WorkspaceMember.position_code.is_not(None),
                )
            )
        )
        emitted_by_card_id = {
            item.incident_card_id: item
            for item in emitted
            if item.incident_card_id is not None
        }
        if workspace.mode == WorkspaceMode.SHARED.value:
            position_codes.clear()
        service_rows: list[tuple[CardService, EmergencyService]] = []
        if position_codes and emitted_by_card_id:
            service_rows = list(
                (
                    await session.execute(
                        select(CardService, EmergencyService)
                        .join(
                            EmergencyService,
                            EmergencyService.id == CardService.service_id,
                        )
                        .where(
                            CardService.card_id.in_(emitted_by_card_id),
                            CardService.is_active.is_(True),
                            EmergencyService.is_active.is_(True),
                            EmergencyService.code.in_(position_codes),
                        )
                        .order_by(CardService.card_id, EmergencyService.code)
                    )
                ).all()
            )

        waiting_for_decision: list[dict[str, Any]] = []
        decisions_completed = 0
        for card_service, emergency_service in service_rows:
            item = emitted_by_card_id[card_service.card_id]
            if card_service.decided_at is None:
                waiting = {
                    "scenario_card_key": item.scenario_card_key,
                    "incident_card_id": str(card_service.card_id),
                    "service_code": emergency_service.code,
                }
                waiting_for_decision.append(waiting)
                blockers.append(
                    {
                        "code": "SERVICE_DECISION_PENDING",
                        "message": "A participant service has not decided the card",
                        **waiting,
                    }
                )
            else:
                decisions_completed += 1

        if training_session.status != TrainingSessionStatus.RUNNING.value:
            blockers.append(
                {
                    "code": "SESSION_NOT_RUNNING",
                    "message": "Only a running session can be completed",
                }
            )

        next_scheduled_at = min(
            (
                item.scheduled_at
                for item in [*pending, *calls_by_status[TrainingCallStatus.PENDING.value]]
                if item.scheduled_at is not None
            ),
            default=None,
        )
        generation_next_raw = generation_state.get("next_generation_at")
        if isinstance(generation_next_raw, str):
            generation_next = datetime.fromisoformat(generation_next_raw)
            if generation_next.tzinfo is None:
                generation_next = generation_next.replace(tzinfo=timezone.utc)
            if next_scheduled_at is None or generation_next < next_scheduled_at:
                next_scheduled_at = generation_next
        return {
            "training_session_id": str(training_session.id),
            "status": training_session.status,
            "completion_policy": training_session.completion_policy,
            "can_complete": not blockers,
            "ready_to_complete_at": _iso(training_session.ready_to_complete_at),
            "cards_total": len(scheduled_cards),
            "cards_pending": len(pending),
            "cards_emitted": len(emitted),
            "cards_failed": len(failed),
            "cards_cancelled": len(cancelled),
            "generation_status": generation_status,
            "generated_cards": int(generation_state.get("generated_count", 0)),
            "generation_target": int(generation_state.get("target_count", 0)),
            "calls_total": len(training_calls),
            "calls_pending": len(calls_by_status[TrainingCallStatus.PENDING.value]),
            "calls_ringing": len(calls_by_status[TrainingCallStatus.RINGING.value]),
            "calls_active": len(calls_by_status[TrainingCallStatus.ACTIVE.value]),
            "calls_completed": len(calls_by_status[TrainingCallStatus.COMPLETED.value]),
            "calls_failed": len(calls_by_status[TrainingCallStatus.FAILED.value]),
            "calls_cancelled": len(calls_by_status[TrainingCallStatus.CANCELLED.value]),
            "decisions_required": len(service_rows),
            "decisions_completed": decisions_completed,
            "audio_messages_total": len(audio_messages),
            "audio_messages_pending": len(pending_audio),
            "audio_messages_failed": len(failed_audio),
            "semantic_evaluations_total": len(
                set(evaluation_requests) | set(evaluation_results)
            ),
            "semantic_evaluations_pending": len(pending_evaluations),
            "semantic_evaluations_failed": len(failed_evaluations),
            "pending_card_keys": [item.scenario_card_key for item in pending],
            "failed_card_keys": [item.scenario_card_key for item in failed],
            "cancelled_card_keys": [item.scenario_card_key for item in cancelled],
            "waiting_for_decision": waiting_for_decision,
            "next_scheduled_at": _iso(next_scheduled_at),
            "blockers": blockers,
            "revision": training_session.completion_state_revision,
        }

    async def refresh(
        self,
        session: AsyncSession,
        training_session: TrainingSession,
    ) -> tuple[dict[str, Any], bool]:
        # Serialize readiness revisions across API requests and background workers.
        # The caller may already have this object in its identity map, so reload it
        # after acquiring the row lock to see the last committed revision/state.
        # Flush the caller's own changes before populate_existing replaces ORM data.
        await session.flush()
        training_session = await session.scalar(
            select(TrainingSession)
            .where(TrainingSession.id == training_session.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if training_session is None:
            raise ConflictError("Training session is missing")
        workspace = await self._workspace(session, training_session.id)
        state = await self.calculate(session, training_session, workspace=workspace)
        previous = dict(training_session.completion_state or {})
        if self._comparable(previous) == self._comparable(state):
            return previous or state, False

        if state["can_complete"]:
            if not previous.get("can_complete") or training_session.ready_to_complete_at is None:
                training_session.ready_to_complete_at = utcnow()
        else:
            training_session.ready_to_complete_at = None

        training_session.completion_state_revision += 1
        state["revision"] = training_session.completion_state_revision
        state["ready_to_complete_at"] = _iso(training_session.ready_to_complete_at)
        training_session.completion_state = state

        assignment = await session.get(
            ScenarioAssignment, training_session.assignment_id
        )
        if assignment is None:
            raise ConflictError("Scenario assignment is missing")
        self._add_readiness_event(
            session,
            training_session=training_session,
            workspace=workspace,
            assignment=assignment,
            state=state,
        )
        await session.flush()
        return state, True

    @staticmethod
    def _comparable(state: dict[str, Any]) -> dict[str, Any]:
        return {
            key: value
            for key, value in state.items()
            if key not in {"revision", "ready_to_complete_at"}
        }

    @staticmethod
    async def _workspace(
        session: AsyncSession, training_session_id: uuid.UUID
    ) -> SimulationWorkspace:
        workspace = await session.scalar(
            select(SimulationWorkspace).where(
                SimulationWorkspace.training_session_id == training_session_id
            )
        )
        if workspace is None:
            raise ConflictError("Training session workspace is missing")
        return workspace

    def _add_readiness_event(
        self,
        session: AsyncSession,
        *,
        training_session: TrainingSession,
        workspace: SimulationWorkspace,
        assignment: ScenarioAssignment,
        state: dict[str, Any],
    ) -> None:
        event_id = uuid.uuid4()
        occurred_at = utcnow()
        session.add(
            OutboxEvent(
                id=event_id,
                aggregate_type="training_completion_readiness",
                aggregate_id=str(training_session.id),
                aggregate_version=training_session.completion_state_revision,
                event_type="training.session.completion-readiness-changed",
                topic=self.topic,
                message_key=str(training_session.id),
                payload={
                    "event_id": str(event_id),
                    "event_type": "training.session.completion-readiness-changed",
                    "aggregate_type": "training_session",
                    "aggregate_id": str(training_session.id),
                    "aggregate_version": training_session.completion_state_revision,
                    "workspace_id": str(workspace.id),
                    "teacher_id": str(assignment.assigned_by),
                    "teacher_ids": [str(assignment.assigned_by)],
                    "occurred_at": occurred_at.isoformat(),
                    "data": state,
                },
            )
        )
