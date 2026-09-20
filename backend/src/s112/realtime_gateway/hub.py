from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, AsyncIterator


@dataclass
class Subscription:
    id: uuid.UUID
    queue: asyncio.Queue[dict[str, Any]]
    card_id: str | None
    workspace_id: str | None
    teacher_id: str | None


class RealtimeHub:
    def __init__(self, queue_size: int = 200) -> None:
        self.queue_size = queue_size
        self._subscriptions: dict[uuid.UUID, Subscription] = {}
        self._lock = asyncio.Lock()

    @asynccontextmanager
    async def subscribe(
        self,
        card_id: str | None = None,
        workspace_id: str | None = None,
        teacher_id: str | None = None,
    ) -> AsyncIterator[Subscription]:
        subscription = Subscription(
            id=uuid.uuid4(),
            queue=asyncio.Queue(maxsize=self.queue_size),
            card_id=card_id,
            workspace_id=workspace_id,
            teacher_id=teacher_id,
        )
        async with self._lock:
            self._subscriptions[subscription.id] = subscription
        try:
            yield subscription
        finally:
            async with self._lock:
                self._subscriptions.pop(subscription.id, None)

    async def publish(self, event: dict[str, Any]) -> int:
        aggregate_id = str(event.get("aggregate_id") or "")
        workspace_id = str(
            event.get("workspace_id") or event.get("data", {}).get("workspace_id") or ""
        )
        teacher_ids = {
            str(value)
            for value in event.get("teacher_ids", [])
            if value is not None
        }
        if event.get("teacher_id") is not None:
            teacher_ids.add(str(event["teacher_id"]))
        async with self._lock:
            subscriptions = list(self._subscriptions.values())

        delivered = 0
        for subscription in subscriptions:
            if subscription.card_id and subscription.card_id != aggregate_id:
                continue
            if subscription.workspace_id and subscription.workspace_id != workspace_id:
                continue
            if subscription.teacher_id and subscription.teacher_id not in teacher_ids:
                continue
            if subscription.queue.full():
                try:
                    subscription.queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                gap_event = {
                    "event_id": str(uuid.uuid4()),
                    "event_type": "stream.gap",
                    "aggregate_id": aggregate_id,
                    "data": {"reason": "client_queue_overflow", "resync_required": True},
                }
                subscription.queue.put_nowait(gap_event)
            else:
                subscription.queue.put_nowait(event)
            delivered += 1
        return delivered

    @property
    def connection_count(self) -> int:
        return len(self._subscriptions)
