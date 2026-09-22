from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from aiokafka import AIOKafkaConsumer, TopicPartition
from sqlalchemy import select

from s112.api.scenario_completion import ScenarioCompletionService
from s112.common.config import Settings
from s112.common.database import Database
from s112.common.enums import (
    AudioMessageDirection,
    AudioMessageKind,
    TrainingActionResult,
    WorkspaceMemberRole,
)
from s112.domain.models import (
    AudioMessage,
    EventInbox,
    OutboxEvent,
    SessionScheduledCard,
    TrainingAction,
    TrainingSession,
    WorkspaceMember,
)
from s112.semantic_evaluation.rules import (
    EVALUATION_REQUESTED_ACTION,
    EVALUATION_RESULT_ACTION,
    outbound_call_rule,
)


logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SpeechResultWorker:
    def __init__(
        self,
        database: Database,
        settings: Settings,
        *,
        consumer: AIOKafkaConsumer | None = None,
    ) -> None:
        self.database = database
        self.settings = settings
        self.consumer_name = settings.speech_result_consumer_group
        self._consumer = consumer or AIOKafkaConsumer(
            settings.audio_stt_result_topic,
            settings.audio_tts_result_topic,
            settings.audio_failed_topic,
            bootstrap_servers=settings.kafka_servers,
            group_id=settings.speech_result_consumer_group,
            enable_auto_commit=False,
            auto_offset_reset="earliest",
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
        event_type = str(payload["event_type"])
        data = payload.get("data")
        if not isinstance(data, dict):
            raise ValueError("Audio result event data must be an object")
        message_id = uuid.UUID(str(data["audio_message_id"]))

        async with self.database.write_session_factory() as session:
            async with session.begin():
                if await session.get(
                    EventInbox, (self.consumer_name, event_id)
                ):
                    return
                message = await session.scalar(
                    select(AudioMessage)
                    .where(AudioMessage.id == message_id)
                    .with_for_update()
                )
                if message is None:
                    logger.error(
                        "Audio result %s references missing message %s",
                        event_id,
                        message_id,
                    )
                    session.add(
                        EventInbox(
                            consumer_name=self.consumer_name,
                            event_id=event_id,
                        )
                    )
                    return

                if event_type == "audio.stt.completed":
                    await self._record_transcript_action(session, message)
                    await self._request_semantic_evaluation(
                        session,
                        message,
                        source_event_id=event_id,
                    )
                    realtime_event_type = "training.audio_transcribed"
                elif event_type == "audio.tts.completed":
                    realtime_event_type = "training.tts_completed"
                elif event_type in {"audio.stt.failed", "audio.tts.failed"}:
                    realtime_event_type = "training.audio_processing_failed"
                else:
                    raise ValueError(f"Unsupported audio result event: {event_type}")

                await self._add_realtime_outbox(
                    session,
                    message,
                    realtime_event_type,
                    source_event_id=event_id,
                )
                training_session = await session.scalar(
                    select(TrainingSession)
                    .where(
                        TrainingSession.id == message.training_session_id
                    )
                    .with_for_update()
                )
                if training_session is not None:
                    await ScenarioCompletionService(
                        self.settings.kafka_topic
                    ).refresh(session, training_session)
                session.add(
                    EventInbox(
                        consumer_name=self.consumer_name,
                        event_id=event_id,
                    )
                )

    async def _record_transcript_action(
        self, session: Any, message: AudioMessage
    ) -> None:
        if message.kind != AudioMessageKind.STT.value or not message.transcript:
            raise ValueError("Completed STT message has no transcript")
        request_id = f"audio-transcript:{message.id}"
        existing = await session.scalar(
            select(TrainingAction.id).where(
                TrainingAction.training_session_id == message.training_session_id,
                TrainingAction.request_id == request_id,
            )
        )
        if existing is None:
            session.add(
                TrainingAction(
                    id=uuid.uuid4(),
                    training_session_id=message.training_session_id,
                    workspace_id=message.workspace_id,
                    actor_user_id=message.actor_user_id,
                    incident_card_id=message.incident_card_id,
                    action_type="AUDIO_MESSAGE_TRANSCRIBED",
                    entity_type="audio_message",
                    entity_id=str(message.id),
                    occurred_at=message.created_at,
                    request_id=request_id,
                    result=TrainingActionResult.SUCCESS.value,
                    details={
                        "audio_message_id": str(message.id),
                        "sequence_no": message.sequence_no,
                        "transcript": message.transcript,
                        "direction": message.direction,
                    },
                )
            )
        message.action_recorded_at = utcnow()

    async def _request_semantic_evaluation(
        self,
        session: Any,
        message: AudioMessage,
        *,
        source_event_id: uuid.UUID,
    ) -> None:
        if (
            message.kind != AudioMessageKind.STT.value
            or message.direction != AudioMessageDirection.OUTBOUND.value
            or not message.transcript
            or message.incident_card_id is None
        ):
            return

        scheduled_card = await session.scalar(
            select(SessionScheduledCard).where(
                SessionScheduledCard.training_session_id
                == message.training_session_id,
                SessionScheduledCard.incident_card_id == message.incident_card_id,
            )
        )
        if scheduled_card is None:
            return
        try:
            rule = outbound_call_rule(
                scheduled_card.evaluation_rules,
                scheduled_card.expected_result,
            )
        except ValueError as exc:
            self._record_semantic_configuration_error(session, message, exc)
            return
        if rule is None:
            return

        request_id = f"semantic-evaluation-request:{message.id}"
        existing_action = await session.scalar(
            select(TrainingAction.id).where(
                TrainingAction.training_session_id == message.training_session_id,
                TrainingAction.request_id == request_id,
            )
        )
        if existing_action is None:
            session.add(
                TrainingAction(
                    id=uuid.uuid4(),
                    training_session_id=message.training_session_id,
                    workspace_id=message.workspace_id,
                    actor_user_id=message.actor_user_id,
                    incident_card_id=message.incident_card_id,
                    action_type=EVALUATION_REQUESTED_ACTION,
                    entity_type="audio_message",
                    entity_id=str(message.id),
                    occurred_at=utcnow(),
                    request_id=request_id,
                    result=TrainingActionResult.SUCCESS.value,
                    details={
                        "audio_message_id": str(message.id),
                        "sequence_no": message.sequence_no,
                        "expected_text": rule.expected_text,
                        "actual_text": message.transcript,
                        "minimum_similarity": rule.minimum_similarity,
                    },
                )
            )

        existing_event = await session.scalar(
            select(OutboxEvent.id).where(
                OutboxEvent.aggregate_type == "semantic_evaluation",
                OutboxEvent.aggregate_id == str(message.id),
                OutboxEvent.aggregate_version == 1,
            )
        )
        if existing_event is not None:
            return
        event_id = uuid.uuid4()
        session.add(
            OutboxEvent(
                id=event_id,
                aggregate_type="semantic_evaluation",
                aggregate_id=str(message.id),
                aggregate_version=1,
                event_type="training.semantic-evaluation.requested",
                topic=self.settings.semantic_evaluation_request_topic,
                message_key=str(message.training_session_id),
                payload={
                    "schema_version": 1,
                    "event_id": str(event_id),
                    "event_type": "training.semantic-evaluation.requested",
                    "aggregate_type": "semantic_evaluation",
                    "aggregate_id": str(message.id),
                    "aggregate_version": 1,
                    "occurred_at": utcnow().isoformat(),
                    "correlation_id": str(message.id),
                    "causation_id": str(source_event_id),
                    "data": {
                        "audio_message_id": str(message.id),
                        "training_session_id": str(message.training_session_id),
                        "workspace_id": str(message.workspace_id),
                        "incident_card_id": str(message.incident_card_id),
                        "actor_user_id": (
                            str(message.actor_user_id)
                            if message.actor_user_id
                            else None
                        ),
                        "sequence_no": message.sequence_no,
                        "expected_text": rule.expected_text,
                        "actual_text": message.transcript,
                        "minimum_similarity": rule.minimum_similarity,
                    },
                },
            )
        )

    @staticmethod
    def _record_semantic_configuration_error(
        session: Any,
        message: AudioMessage,
        error: ValueError,
    ) -> None:
        session.add(
            TrainingAction(
                id=uuid.uuid4(),
                training_session_id=message.training_session_id,
                workspace_id=message.workspace_id,
                actor_user_id=message.actor_user_id,
                incident_card_id=message.incident_card_id,
                action_type=EVALUATION_RESULT_ACTION,
                entity_type="audio_message",
                entity_id=str(message.id),
                occurred_at=utcnow(),
                request_id=f"semantic-evaluation-result:{message.id}",
                result=TrainingActionResult.ERROR.value,
                details={
                    "audio_message_id": str(message.id),
                    "error": f"Invalid outbound_call rule: {error}",
                },
            )
        )

    async def _add_realtime_outbox(
        self,
        session: Any,
        message: AudioMessage,
        event_type: str,
        *,
        source_event_id: uuid.UUID,
    ) -> None:
        existing = await session.scalar(
            select(OutboxEvent.id).where(
                OutboxEvent.aggregate_type == "audio_notification",
                OutboxEvent.aggregate_id == str(message.id),
                OutboxEvent.aggregate_version == message.revision,
            )
        )
        if existing is not None:
            return
        teacher_ids = list(
            await session.scalars(
                select(WorkspaceMember.user_id).where(
                    WorkspaceMember.workspace_id == message.workspace_id,
                    WorkspaceMember.member_role
                    == WorkspaceMemberRole.INSTRUCTOR.value,
                    WorkspaceMember.left_at.is_(None),
                )
            )
        )
        event_id = uuid.uuid4()
        session.add(
            OutboxEvent(
                id=event_id,
                aggregate_type="audio_notification",
                aggregate_id=str(message.id),
                aggregate_version=message.revision,
                event_type=event_type,
                topic=self.settings.kafka_topic,
                message_key=str(message.training_session_id),
                payload={
                    "schema_version": 1,
                    "event_id": str(event_id),
                    "event_type": event_type,
                    "aggregate_type": "audio_message",
                    "aggregate_id": str(message.id),
                    "aggregate_version": message.revision,
                    "workspace_id": str(message.workspace_id),
                    "teacher_ids": [str(value) for value in teacher_ids],
                    "occurred_at": utcnow().isoformat(),
                    "correlation_id": str(message.id),
                    "causation_id": str(source_event_id),
                    "data": {
                        "audio_message_id": str(message.id),
                        "session_id": str(message.training_session_id),
                        "workspace_id": str(message.workspace_id),
                        "incident_card_id": (
                            str(message.incident_card_id)
                            if message.incident_card_id
                            else None
                        ),
                        "actor_user_id": (
                            str(message.actor_user_id)
                            if message.actor_user_id
                            else None
                        ),
                        "kind": message.kind,
                        "direction": message.direction,
                        "status": message.status,
                        "sequence_no": message.sequence_no,
                        "transcript": message.transcript,
                        "content_url": (
                            f"/api/v1/audio-messages/{message.id}/content"
                            if message.size_bytes is not None
                            else None
                        ),
                        "error": message.last_error,
                    },
                },
            )
        )

    @staticmethod
    def _decode_event(raw_value: bytes) -> dict[str, Any]:
        value = json.loads(raw_value.decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("Kafka audio event must be an object")
        return value
