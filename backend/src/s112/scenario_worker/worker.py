from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.schemas import CardCreate
from s112.api.service import CardApplicationService
from s112.common.database import Database
from s112.common.enums import (
    ScenarioTriggerType,
    ScheduledCardStatus,
    TrainingActionResult,
    TrainingSessionStatus,
)
from s112.domain.models import (
    SessionScheduledCard,
    TrainingAction,
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

    async def run_once(self) -> int:
        now = utcnow()
        async with self.database.write_session_factory() as session:
            async with session.begin():
                await self.emitter.card_service.process_service_deadlines(
                    session, now, batch_size=self.batch_size
                )
                await self._resolve_action_triggers(session, now)
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
        return emitted

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
            source_key = item.trigger_config.get("card_key")
            action_type = item.trigger_config.get("action_type")
            if not source_key or not action_type:
                continue
            source = await session.scalar(
                select(SessionScheduledCard).where(
                    SessionScheduledCard.training_session_id == item.training_session_id,
                    SessionScheduledCard.scenario_card_key == source_key,
                )
            )
            if source is None or source.incident_card_id is None:
                continue
            action = await session.scalar(
                select(TrainingAction)
                .where(
                    TrainingAction.training_session_id == item.training_session_id,
                    TrainingAction.incident_card_id == source.incident_card_id,
                    TrainingAction.action_type == action_type,
                    TrainingAction.result == TrainingActionResult.SUCCESS.value,
                )
                .order_by(TrainingAction.occurred_at)
                .limit(1)
            )
            if action is not None:
                occurred_at = action.occurred_at
                if occurred_at.tzinfo is None:
                    occurred_at = occurred_at.replace(tzinfo=timezone.utc)
                item.scheduled_at = occurred_at + timedelta(
                    seconds=int(item.trigger_config.get("delay_seconds", 0))
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
