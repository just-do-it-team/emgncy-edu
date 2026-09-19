from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from s112.common.config import Settings
from s112.common.database import Database
from s112.common.enums import OutboxStatus
from s112.domain.models import OutboxEvent
from s112.outbox_worker.worker import OutboxWorker


class FakePublisher:
    def __init__(self) -> None:
        self.events: list[OutboxEvent] = []

    async def start(self) -> None:
        pass

    async def stop(self) -> None:
        pass

    async def publish(self, event: OutboxEvent) -> None:
        self.events.append(event)


async def test_outbox_preserves_order_with_multiple_versions(database: Database) -> None:
    aggregate_id = str(uuid.uuid4())
    async with database.write_session_factory() as session:
        async with session.begin():
            for version in (1, 2):
                event_id = uuid.uuid4()
                session.add(
                    OutboxEvent(
                        id=event_id,
                        aggregate_type="incident_card",
                        aggregate_id=aggregate_id,
                        aggregate_version=version,
                        event_type=f"card.event.{version}",
                        topic="card.events",
                        message_key=aggregate_id,
                        payload={"event_id": str(event_id), "aggregate_version": version},
                        available_at=datetime.now(timezone.utc),
                    )
                )

    publisher = FakePublisher()
    settings = Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        outbox_batch_size=100,
    )
    worker = OutboxWorker(database, publisher, settings, worker_id="test-worker")

    assert await worker.run_once() == 1
    assert [event.aggregate_version for event in publisher.events] == [1]
    assert await worker.run_once() == 1
    assert [event.aggregate_version for event in publisher.events] == [1, 2]

    async with database.read_session_factory() as session:
        statuses = list(
            await session.scalars(
                select(OutboxEvent.status).order_by(OutboxEvent.aggregate_version)
            )
        )
    assert statuses == [OutboxStatus.PUBLISHED.value, OutboxStatus.PUBLISHED.value]

