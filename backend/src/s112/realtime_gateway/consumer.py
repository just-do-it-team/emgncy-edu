from __future__ import annotations

import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer

from s112.common.config import Settings
from s112.realtime_gateway.hub import RealtimeHub


logger = logging.getLogger(__name__)


class RealtimeKafkaConsumer:
    def __init__(self, settings: Settings, hub: RealtimeHub) -> None:
        self.settings = settings
        self.hub = hub
        self._consumer: AIOKafkaConsumer | None = None
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        self._consumer = AIOKafkaConsumer(
            self.settings.kafka_topic,
            bootstrap_servers=self.settings.kafka_servers,
            group_id=f"s112-realtime-{self.settings.realtime_instance_id}",
            enable_auto_commit=False,
            auto_offset_reset="latest",
        )
        await self._consumer.start()
        self._task = asyncio.create_task(self._consume(), name="realtime-kafka-consumer")

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._consumer:
            await self._consumer.stop()
            self._consumer = None

    async def _consume(self) -> None:
        if self._consumer is None:
            raise RuntimeError("Kafka consumer is not started")
        async for message in self._consumer:
            try:
                event = json.loads(message.value.decode("utf-8"))
                await self.hub.publish(event)
            except Exception:
                logger.exception(
                    "Realtime event processing failed at %s:%s",
                    message.partition,
                    message.offset,
                )
                continue
            await self._consumer.commit()
