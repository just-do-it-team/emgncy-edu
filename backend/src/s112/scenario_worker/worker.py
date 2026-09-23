from __future__ import annotations

import asyncio
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.schemas import CardCreate
from s112.api.scenario_completion import ScenarioCompletionService
from s112.api.procedural import procedural_card_work_finished
from s112.api.service import CardApplicationService
from s112.api.simulation_service import SimulationApplicationService
from s112.common.database import Database
from s112.common.enums import (
    ScenarioTriggerType,
    ScenarioCompletionPolicy,
    ProceduralGenerationStatus,
    ScheduledCardStatus,
    TrainingActionResult,
    TrainingCallStatus,
    TrainingSessionStatus,
)
from s112.domain.models import (
    SessionScheduledCard,
    ScenarioAssignment,
    SimulationWorkspace,
    TrainingAction,
    TrainingCall,
    TrainingSession,
)


logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ScenarioCardEmitter:
    def __init__(self, kafka_topic: str) -> None:
        self.card_service = CardApplicationService(kafka_topic)

    async def emit(
        self,
        session: AsyncSession,
        item: SessionScheduledCard,
        *,
        actor_id: uuid.UUID | None = None,
    ) -> SessionScheduledCard:
        if item.status == ScheduledCardStatus.EMITTED.value:
            return item
        if item.status != ScheduledCardStatus.PENDING.value:
            raise ValueError(f"Scheduled card cannot be emitted from status {item.status}")
        training_session = await session.get(TrainingSession, item.training_session_id)
        if (
            training_session is None
            or training_session.status != TrainingSessionStatus.RUNNING.value
        ):
            raise ValueError("Training session is not running")

        request = CardCreate.model_validate(item.card_payload).model_copy(
            update={
                "workspace_id": item.workspace_id,
                "operator_id": actor_id,
                "request_id": f"scenario-release:{item.id}",
            }
        )
        card = await self.card_service.create_card(
            session,
            request,
            allow_system_actor=actor_id is None,
            action_type="CARD_RELEASED",
        )
        item.status = ScheduledCardStatus.EMITTED.value
        item.incident_card_id = card.id
        item.emitted_at = utcnow()
        item.attempts += 1
        item.last_error = None
        await session.flush()
        return item


class ScenarioCallEmitter:
    async def emit(
        self,
        session: AsyncSession,
        item: TrainingCall,
        *,
        actor_id: uuid.UUID | None = None,
    ) -> TrainingCall:
        if item.status == TrainingCallStatus.RINGING.value:
            return item
        if item.status != TrainingCallStatus.PENDING.value:
            raise ValueError(f"Training call cannot ring from status {item.status}")
        training_session = await session.get(TrainingSession, item.training_session_id)
        if (
            training_session is None
            or training_session.status != TrainingSessionStatus.RUNNING.value
        ):
            raise ValueError("Training session is not running")

        now = utcnow()
        item.status = TrainingCallStatus.RINGING.value
        item.ringing_at = now
        item.attempts += 1
        item.last_error = None
        session.add(
            TrainingAction(
                training_session_id=item.training_session_id,
                workspace_id=item.workspace_id,
                actor_user_id=actor_id,
                action_type="INCOMING_CALL_RINGING",
                entity_type="training_call",
                entity_id=str(item.id),
                occurred_at=now,
                request_id=f"incoming-call-ring:{item.id}",
                result=TrainingActionResult.SUCCESS.value,
                details={"scenario_item_key": item.scenario_item_key},
            )
        )
        await session.flush()
        return item


class ScenarioSchedulerWorker:
    def __init__(
        self,
        database: Database,
        kafka_topic: str,
        *,
        batch_size: int = 100,
        retry_limit: int = 5,
    ) -> None:
        self.database = database
        self.batch_size = batch_size
        self.retry_limit = retry_limit
        self.emitter = ScenarioCardEmitter(kafka_topic)
        self.call_emitter = ScenarioCallEmitter()
        self.completion = ScenarioCompletionService(kafka_topic)
        self.simulation = SimulationApplicationService(kafka_topic)

    async def run_once(self) -> int:
        now = utcnow()
        async with self.database.write_session_factory() as session:
            async with session.begin():
                await self.emitter.card_service.process_service_deadlines(
                    session, now, batch_size=self.batch_size
                )
                await self._resolve_action_triggers(session, now)
                await self._generate_procedural_cards(session, now)
                statement = (
                    select(SessionScheduledCard.id)
                    .join(
                        TrainingSession,
                        TrainingSession.id == SessionScheduledCard.training_session_id,
                    )
                    .where(
                        SessionScheduledCard.status == ScheduledCardStatus.PENDING.value,
                        SessionScheduledCard.scheduled_at.is_not(None),
                        SessionScheduledCard.scheduled_at <= now,
                        TrainingSession.status == TrainingSessionStatus.RUNNING.value,
                    )
                    .order_by(SessionScheduledCard.scheduled_at, SessionScheduledCard.id)
                    .limit(self.batch_size)
                )
                if session.bind and session.bind.dialect.name == "postgresql":
                    statement = statement.with_for_update(skip_locked=True)
                item_ids = list(await session.scalars(statement))
                call_statement = (
                    select(TrainingCall.id)
                    .join(
                        TrainingSession,
                        TrainingSession.id == TrainingCall.training_session_id,
                    )
                    .where(
                        TrainingCall.status == TrainingCallStatus.PENDING.value,
                        TrainingCall.scheduled_at.is_not(None),
                        TrainingCall.scheduled_at <= now,
                        TrainingSession.status == TrainingSessionStatus.RUNNING.value,
                    )
                    .order_by(TrainingCall.scheduled_at, TrainingCall.id)
                    .limit(self.batch_size)
                )
                if session.bind and session.bind.dialect.name == "postgresql":
                    call_statement = call_statement.with_for_update(skip_locked=True)
                call_ids = list(await session.scalars(call_statement))

        emitted = 0
        for item_id in item_ids:
            try:
                async with self.database.write_session_factory() as session:
                    async with session.begin():
                        statement = select(SessionScheduledCard).where(
                            SessionScheduledCard.id == item_id
                        )
                        if session.bind and session.bind.dialect.name == "postgresql":
                            statement = statement.with_for_update(skip_locked=True)
                        item = await session.scalar(statement)
                        if item is None or item.status != ScheduledCardStatus.PENDING.value:
                            continue
                        await self.emitter.emit(session, item)
                emitted += 1
            except Exception as exc:
                logger.exception("Failed to emit scenario card %s", item_id)
                await self._record_failure(item_id, exc)
        for call_id in call_ids:
            try:
                async with self.database.write_session_factory() as session:
                    async with session.begin():
                        statement = select(TrainingCall).where(TrainingCall.id == call_id)
                        if session.bind and session.bind.dialect.name == "postgresql":
                            statement = statement.with_for_update(skip_locked=True)
                        item = await session.scalar(statement)
                        if item is None or item.status != TrainingCallStatus.PENDING.value:
                            continue
                        await self.call_emitter.emit(session, item)
                emitted += 1
            except Exception as exc:
                logger.exception("Failed to emit incoming call %s", call_id)
                await self._record_call_failure(call_id, exc)
        await self._refresh_completion_states()
        return emitted

    async def _generate_procedural_cards(
        self, session: AsyncSession, now: datetime
    ) -> None:
        statement = (
            select(TrainingSession)
            .where(TrainingSession.status == TrainingSessionStatus.RUNNING.value)
            .order_by(TrainingSession.started_at, TrainingSession.id)
            .limit(self.batch_size)
        )
        if session.bind and session.bind.dialect.name == "postgresql":
            statement = statement.with_for_update(skip_locked=True)
        training_sessions = list(await session.scalars(statement))
        for training_session in training_sessions:
            state = dict(training_session.generation_state or {})
            if state.get("status") != ProceduralGenerationStatus.RUNNING.value:
                continue
            next_at_raw = state.get("next_generation_at")
            if not isinstance(next_at_raw, str):
                state["status"] = ProceduralGenerationStatus.FAILED.value
                state["last_error"] = "next_generation_at is missing"
                training_session.generation_state = state
                continue
            next_at = datetime.fromisoformat(next_at_raw)
            if next_at.tzinfo is None:
                next_at = next_at.replace(tzinfo=timezone.utc)
            if next_at > now:
                continue

            generator_key = str(state["generator_key"])
            generated_count = int(state["generated_count"])
            target_count = int(state["target_count"])
            if generated_count >= target_count:
                state["status"] = ProceduralGenerationStatus.EXHAUSTED.value
                state["next_generation_at"] = None
                training_session.generation_state = state
                continue

            generated_items = list(
                await session.scalars(
                    select(SessionScheduledCard)
                    .where(
                        SessionScheduledCard.training_session_id == training_session.id,
                        SessionScheduledCard.generator_key == generator_key,
                    )
                    .order_by(SessionScheduledCard.generation_index)
                )
            )
            active_count = 0
            for item in generated_items:
                if item.status == ScheduledCardStatus.PENDING.value:
                    active_count += 1
                elif (
                    item.status == ScheduledCardStatus.EMITTED.value
                    and not await procedural_card_work_finished(session, item)
                ):
                    active_count += 1
            if active_count >= int(state["max_active"]):
                continue

            remaining_ids = list(state.get("remaining_template_ids", []))
            if not remaining_ids:
                state["status"] = ProceduralGenerationStatus.FAILED.value
                state["last_error"] = "Procedural template pool was exhausted early"
                training_session.generation_state = state
                continue
            selected_id = secrets.choice(remaining_ids)
            assignment = await session.get(
                ScenarioAssignment, training_session.assignment_id
            )
            if assignment is None:
                state["status"] = ProceduralGenerationStatus.FAILED.value
                state["last_error"] = "Scenario assignment is missing"
                training_session.generation_state = state
                continue
            catalog = assignment.scenario_snapshot["definition"][
                "procedural_catalog"
            ]
            template = next(
                (item for item in catalog if item["template_id"] == selected_id),
                None,
            )
            if template is None:
                state["status"] = ProceduralGenerationStatus.FAILED.value
                state["last_error"] = "Selected template is missing from snapshot"
                training_session.generation_state = state
                continue

            generation_index = generated_count + 1
            session.add(
                SessionScheduledCard(
                    training_session_id=training_session.id,
                    workspace_id=await self._workspace_id(session, training_session.id),
                    scenario_card_key=(
                        f"generated.{generator_key}.{generation_index:04d}"
                    ),
                    trigger_type=ScenarioTriggerType.TIME_OFFSET.value,
                    trigger_config={"offset_seconds": 0},
                    source_type="SNAPSHOT",
                    card_payload=template["initial_card"],
                    expected_result=template["expected_result"],
                    evaluation_rules=template.get("evaluation_rules", {}),
                    scheduled_at=now,
                    status=ScheduledCardStatus.PENDING.value,
                    generator_key=generator_key,
                    generation_index=generation_index,
                    source_template_id=uuid.UUID(selected_id),
                )
            )
            remaining_ids.remove(selected_id)
            state["generated_count"] = generation_index
            state["remaining_template_ids"] = remaining_ids
            if generation_index >= target_count:
                state["status"] = ProceduralGenerationStatus.EXHAUSTED.value
                state["next_generation_at"] = None
            else:
                state["next_generation_at"] = (
                    now
                    + timedelta(seconds=int(state["release_interval_seconds"]))
                ).isoformat()
            training_session.generation_state = state

    @staticmethod
    async def _workspace_id(
        session: AsyncSession, training_session_id: uuid.UUID
    ) -> uuid.UUID:
        workspace_id = await session.scalar(
            select(SimulationWorkspace.id).where(
                SimulationWorkspace.training_session_id == training_session_id
            )
        )
        if workspace_id is None:
            raise ValueError("Training session workspace is missing")
        return workspace_id

    async def _refresh_completion_states(self) -> None:
        async with self.database.write_session_factory() as session:
            session_ids = list(
                await session.scalars(
                    select(TrainingSession.id)
                    .where(
                        TrainingSession.status == TrainingSessionStatus.RUNNING.value
                    )
                    .order_by(TrainingSession.started_at, TrainingSession.id)
                    .limit(self.batch_size)
                )
            )

        for session_id in session_ids:
            try:
                async with self.database.write_session_factory() as session:
                    async with session.begin():
                        training_session = await session.scalar(
                            select(TrainingSession)
                            .where(TrainingSession.id == session_id)
                            .with_for_update()
                        )
                        if (
                            training_session is None
                            or training_session.status
                            != TrainingSessionStatus.RUNNING.value
                        ):
                            continue
                        readiness, _ = await self.completion.refresh(
                            session, training_session
                        )
                        if (
                            readiness["can_complete"]
                            and training_session.completion_policy
                            == ScenarioCompletionPolicy.AUTO_WHEN_READY.value
                        ):
                            await self.simulation.complete_session(
                                session,
                                training_session.id,
                                None,
                                automatic=True,
                            )
            except Exception:
                logger.exception(
                    "Failed to refresh completion state for training session %s",
                    session_id,
                )

    async def _resolve_action_triggers(
        self, session: AsyncSession, now: datetime
    ) -> None:
        pending = list(
            await session.scalars(
                select(SessionScheduledCard).where(
                    SessionScheduledCard.status == ScheduledCardStatus.PENDING.value,
                    SessionScheduledCard.trigger_type
                    == ScenarioTriggerType.AFTER_ACTION.value,
                    SessionScheduledCard.scheduled_at.is_(None),
                )
            )
        )
        for item in pending:
            action = await self._source_action(
                session,
                training_session_id=item.training_session_id,
                source_key=item.trigger_config.get("card_key"),
                action_type=item.trigger_config.get("action_type"),
            )
            if action is not None:
                occurred_at = action.occurred_at
                if occurred_at.tzinfo is None:
                    occurred_at = occurred_at.replace(tzinfo=timezone.utc)
                item.scheduled_at = occurred_at + timedelta(
                    seconds=int(item.trigger_config.get("delay_seconds", 0))
                )

        pending_calls = list(
            await session.scalars(
                select(TrainingCall).where(
                    TrainingCall.status == TrainingCallStatus.PENDING.value,
                    TrainingCall.trigger_type == ScenarioTriggerType.AFTER_ACTION.value,
                    TrainingCall.scheduled_at.is_(None),
                )
            )
        )
        for item in pending_calls:
            action = await self._source_action(
                session,
                training_session_id=item.training_session_id,
                source_key=item.trigger_config.get("card_key"),
                action_type=item.trigger_config.get("action_type"),
            )
            if action is not None:
                occurred_at = action.occurred_at
                if occurred_at.tzinfo is None:
                    occurred_at = occurred_at.replace(tzinfo=timezone.utc)
                item.scheduled_at = occurred_at + timedelta(
                    seconds=int(item.trigger_config.get("delay_seconds", 0))
                )

    @staticmethod
    async def _source_action(
        session: AsyncSession,
        *,
        training_session_id: uuid.UUID,
        source_key: str | None,
        action_type: str | None,
    ) -> TrainingAction | None:
        if not source_key or not action_type:
            return None
        source_card = await session.scalar(
            select(SessionScheduledCard).where(
                SessionScheduledCard.training_session_id == training_session_id,
                SessionScheduledCard.scenario_card_key == source_key,
            )
        )
        if source_card is not None and source_card.incident_card_id is not None:
            return await session.scalar(
                select(TrainingAction)
                .where(
                    TrainingAction.training_session_id == training_session_id,
                    TrainingAction.incident_card_id == source_card.incident_card_id,
                    TrainingAction.action_type == action_type,
                    TrainingAction.result == TrainingActionResult.SUCCESS.value,
                )
                .order_by(TrainingAction.occurred_at)
                .limit(1)
            )
        source_call = await session.scalar(
            select(TrainingCall).where(
                TrainingCall.training_session_id == training_session_id,
                TrainingCall.scenario_item_key == source_key,
            )
        )
        if source_call is None:
            return None
        return await session.scalar(
            select(TrainingAction)
            .where(
                TrainingAction.training_session_id == training_session_id,
                TrainingAction.entity_type == "training_call",
                TrainingAction.entity_id == str(source_call.id),
                TrainingAction.action_type == action_type,
                TrainingAction.result == TrainingActionResult.SUCCESS.value,
            )
            .order_by(TrainingAction.occurred_at)
            .limit(1)
        )

    async def _record_failure(self, item_id: uuid.UUID, exc: Exception) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                item = await session.scalar(
                    select(SessionScheduledCard)
                    .where(SessionScheduledCard.id == item_id)
                    .with_for_update()
                )
                if item is None or item.status != ScheduledCardStatus.PENDING.value:
                    return
                item.attempts += 1
                item.last_error = str(exc)[:2000]
                if item.attempts >= self.retry_limit:
                    item.status = ScheduledCardStatus.FAILED.value
                else:
                    item.scheduled_at = utcnow() + timedelta(
                        seconds=min(60, 2 ** item.attempts)
                    )

    async def _record_call_failure(self, item_id: uuid.UUID, exc: Exception) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                item = await session.scalar(
                    select(TrainingCall)
                    .where(TrainingCall.id == item_id)
                    .with_for_update()
                )
                if item is None or item.status != TrainingCallStatus.PENDING.value:
                    return
                item.attempts += 1
                item.last_error = str(exc)[:2000]
                if item.attempts >= self.retry_limit:
                    item.status = TrainingCallStatus.FAILED.value
                else:
                    item.scheduled_at = utcnow() + timedelta(
                        seconds=min(60, 2 ** item.attempts)
                    )

    async def run_forever(self, poll_interval_seconds: float) -> None:
        while True:
            try:
                processed = await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Scenario scheduler iteration failed")
                processed = 0
            if processed == 0:
                await asyncio.sleep(poll_interval_seconds)
