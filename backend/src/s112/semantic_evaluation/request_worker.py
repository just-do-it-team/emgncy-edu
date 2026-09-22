from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from aiokafka import AIOKafkaConsumer, TopicPartition

from s112.common.config import Settings
from s112.common.database import Database
from s112.domain.models import EventInbox, OutboxEvent
from s112.semantic_evaluation.client import (
    SemanticEvaluationClient,
    SemanticEvaluationResult,
)


logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SemanticEvaluationRequestWorker:
    def __init__(
        self,
        database: Database,
        client: SemanticEvaluationClient,
        settings: Settings,
        *,
        consumer: AIOKafkaConsumer | None = None,
    ) -> None:
        self.database = database
        self.client = client
        self.settings = settings
        self.consumer_name = settings.semantic_request_consumer_group
        self._consumer = consumer or AIOKafkaConsumer(
            settings.semantic_evaluation_request_topic,
            bootstrap_servers=settings.kafka_servers,
            group_id=self.consumer_name,
            enable_auto_commit=False,
            auto_offset_reset="earliest",
            max_poll_interval_ms=(
                settings.semantic_evaluation_max_poll_interval_seconds * 1000
            ),
        )
        self._owns_consumer = consumer is None
        self._stop_event = asyncio.Event()

    def stop(self) -> None:
        self._stop_event.set()

    async def run(self) -> None:
        if self._owns_consumer:
            await self._consumer.start()
        try:
            async for record in self._consumer:
                if self._stop_event.is_set():
                    break
                await self.process_record(record.value)
                await self._consumer.commit(
                    {
                        TopicPartition(record.topic, record.partition): (
                            record.offset + 1
                        )
                    }
                )
        finally:
            if self._owns_consumer:
                await self._consumer.stop()

    async def process_record(self, raw_value: bytes) -> None:
        payload = self._decode_event(raw_value)
        event_id = uuid.UUID(str(payload["event_id"]))
        if payload.get("event_type") != "training.semantic-evaluation.requested":
            raise ValueError("Unsupported semantic evaluation request event")
        if await self._is_consumed(event_id):
            return
        data = payload.get("data")
        if not isinstance(data, dict):
            raise ValueError("Semantic evaluation event data must be an object")
        expected_text = str(data["expected_text"]).strip()
        actual_text = str(data["actual_text"]).strip()
        minimum_similarity = float(data["minimum_similarity"])
        if not expected_text or not actual_text:
            raise ValueError("Semantic evaluation texts must not be empty")
        if not 0 <= minimum_similarity <= 1:
            raise ValueError("minimum_similarity must be between 0 and 1")

        attempts = 0
        while True:
            attempts += 1
            try:
                outcome = await self.client.evaluate(
                    expected_text=expected_text,
                    actual_text=actual_text,
                )
            except Exception as exc:
                if attempts >= self.settings.semantic_evaluation_retry_limit:
                    logger.exception(
                        "Semantic evaluation %s failed after %d attempts",
                        event_id,
                        attempts,
                    )
                    await self._record_result(
                        payload,
                        request_event_id=event_id,
                        attempts=attempts,
                        error=exc,
                    )
                    return
                delay = min(
                    60.0,
                    self.settings.semantic_evaluation_retry_base_seconds
                    * (2 ** max(0, attempts - 1)),
                )
                logger.warning(
                    "Semantic evaluation %s failed on attempt %d; retrying in %.1fs: %s",
                    event_id,
                    attempts,
                    delay,
                    exc,
                )
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=delay)
                except asyncio.TimeoutError:
                    continue
                raise asyncio.CancelledError
            else:
                await self._record_result(
                    payload,
                    request_event_id=event_id,
                    attempts=attempts,
                    outcome=outcome,
                )
                return

    async def _is_consumed(self, event_id: uuid.UUID) -> bool:
        async with self.database.write_session_factory() as session:
            return (
                await session.get(EventInbox, (self.consumer_name, event_id))
                is not None
            )

    async def _record_result(
        self,
        request_payload: dict[str, Any],
        *,
        request_event_id: uuid.UUID,
        attempts: int,
        outcome: SemanticEvaluationResult | None = None,
        error: Exception | None = None,
    ) -> None:
        data = dict(request_payload["data"])
        message_id = uuid.UUID(str(data["audio_message_id"]))
        minimum_similarity = float(data["minimum_similarity"])
        event_type = (
            "training.semantic-evaluation.completed"
            if outcome is not None
            else "training.semantic-evaluation.failed"
        )
        if outcome is not None:
            data.update(
                {
                    "similarity": outcome.similarity,
                    "passed": outcome.similarity >= minimum_similarity,
                    "missing_facts": outcome.missing_facts,
                    "contradictions": outcome.contradictions,
                    "explanation": outcome.explanation,
                    "model": self.settings.semantic_evaluation_model,
                    "attempts": attempts,
                }
            )
        else:
            data.update(
                {
                    "passed": False,
                    "error": str(error)[:4000] if error else "Unknown evaluation error",
                    "model": self.settings.semantic_evaluation_model,
                    "attempts": attempts,
                }
            )

        async with self.database.write_session_factory() as session:
            async with session.begin():
                if await session.get(
                    EventInbox, (self.consumer_name, request_event_id)
                ):
                    return
                event_id = uuid.uuid4()
                session.add(
                    OutboxEvent(
                        id=event_id,
                        aggregate_type="semantic_evaluation",
                        aggregate_id=str(message_id),
                        aggregate_version=2,
                        event_type=event_type,
                        topic=self.settings.semantic_evaluation_result_topic,
                        message_key=str(data["training_session_id"]),
                        payload={
                            "schema_version": 1,
                            "event_id": str(event_id),
                            "event_type": event_type,
                            "aggregate_type": "semantic_evaluation",
                            "aggregate_id": str(message_id),
                            "aggregate_version": 2,
                            "occurred_at": utcnow().isoformat(),
                            "correlation_id": str(message_id),
                            "causation_id": str(request_event_id),
                            "data": data,
                        },
                    )
                )
                session.add(
                    EventInbox(
                        consumer_name=self.consumer_name,
                        event_id=request_event_id,
                    )
                )

    @staticmethod
    def _decode_event(raw_value: bytes) -> dict[str, Any]:
        value = json.loads(raw_value.decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("Kafka semantic evaluation event must be an object")
        return value
