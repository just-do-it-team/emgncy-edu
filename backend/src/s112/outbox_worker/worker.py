from __future__ import annotations

import asyncio
import json
import logging
import socket
import uuid
from datetime import datetime, timedelta, timezone
from typing import Protocol

from aiokafka import AIOKafkaProducer
from sqlalchemy import exists, or_, select, update
from sqlalchemy.orm import aliased

from s112.common.config import Settings
from s112.common.database import Database
from s112.common.enums import OutboxStatus
from s112.domain.models import OutboxEvent


logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EventPublisher(Protocol):
    async def start(self) -> None: ...

    async def stop(self) -> None: ...

    async def publish(self, event: OutboxEvent) -> None: ...


class KafkaEventPublisher:
    def __init__(self, settings: Settings) -> None:
        self._producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_servers,
            acks="all",
            enable_idempotence=True,
            value_serializer=lambda value: json.dumps(
                value, ensure_ascii=False, separators=(",", ":")
            ).encode("utf-8"),
            key_serializer=lambda value: value.encode("utf-8"),
        )

    async def start(self) -> None:
        await self._producer.start()

    async def stop(self) -> None:
        await self._producer.stop()

    async def publish(self, event: OutboxEvent) -> None:
        await self._producer.send_and_wait(
            event.topic,
            key=event.message_key,
            value=event.payload,
            headers=[("event_id", str(event.id).encode("ascii"))],
        )


class OutboxWorker:
    def __init__(
        self,
        database: Database,
        publisher: EventPublisher,
        settings: Settings,
        *,
        worker_id: str | None = None,
    ) -> None:
        self.database = database
        self.publisher = publisher
        self.settings = settings
        self.worker_id = worker_id or f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}"
        self._stopping = asyncio.Event()

    def stop(self) -> None:
        self._stopping.set()

    async def run(self) -> None:
        await self.publisher.start()
        try:
            while not self._stopping.is_set():
                processed = await self.run_once()
                if processed == 0:
                    try:
                        await asyncio.wait_for(
                            self._stopping.wait(),
                            timeout=self.settings.outbox_poll_interval_seconds,
                        )
                    except asyncio.TimeoutError:
                        pass
        finally:
            await self.publisher.stop()

    async def run_once(self) -> int:
        events = await self._claim_batch()
        for event in events:
            try:
                await self.publisher.publish(event)
            except Exception as exc:  # the event must remain retryable
                logger.exception("Failed to publish outbox event %s", event.id)
                await self._mark_failed(event.id, exc)
            else:
                await self._mark_published(event.id)
        return len(events)

    async def _claim_batch(self) -> list[OutboxEvent]:
        now = utcnow()
        older = aliased(OutboxEvent)
        older_unpublished_exists = exists(
            select(1).where(
                older.aggregate_type == OutboxEvent.aggregate_type,
                older.aggregate_id == OutboxEvent.aggregate_id,
                older.aggregate_version < OutboxEvent.aggregate_version,
                older.status != OutboxStatus.PUBLISHED.value,
            )
        )

        async with self.database.write_session_factory() as session:
            async with session.begin():
                statement = (
                    select(OutboxEvent)
                    .where(
                        OutboxEvent.available_at <= now,
                        or_(
                            OutboxEvent.status.in_(
                                [OutboxStatus.PENDING.value, OutboxStatus.FAILED.value]
                            ),
                            (
                                (OutboxEvent.status == OutboxStatus.PROCESSING.value)
                                & (OutboxEvent.locked_until < now)
                            ),
                        ),
                        ~older_unpublished_exists,
                    )
                    .order_by(OutboxEvent.created_at, OutboxEvent.aggregate_version)
                    .limit(self.settings.outbox_batch_size)
                )
                if session.bind and session.bind.dialect.name == "postgresql":
                    statement = statement.with_for_update(skip_locked=True)

                events = list(await session.scalars(statement))
                lock_until = now + timedelta(seconds=self.settings.outbox_lock_seconds)
                for event in events:
                    event.status = OutboxStatus.PROCESSING.value
                    event.locked_by = self.worker_id
                    event.locked_until = lock_until
                    event.attempts += 1
            return events

    async def _mark_published(self, event_id: uuid.UUID) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                await session.execute(
                    update(OutboxEvent)
                    .where(
                        OutboxEvent.id == event_id,
                        OutboxEvent.locked_by == self.worker_id,
                    )
                    .values(
                        status=OutboxStatus.PUBLISHED.value,
                        published_at=utcnow(),
                        locked_by=None,
                        locked_until=None,
                        last_error=None,
                    )
                )

    async def _mark_failed(self, event_id: uuid.UUID, error: Exception) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                event = await session.get(OutboxEvent, event_id)
                if event is None or event.locked_by != self.worker_id:
                    return
                retry_seconds = min(60, 2 ** min(event.attempts, 6))
                event.status = OutboxStatus.FAILED.value
                event.available_at = utcnow() + timedelta(seconds=retry_seconds)
                event.locked_by = None
                event.locked_until = None
                event.last_error = str(error)[:4000]

