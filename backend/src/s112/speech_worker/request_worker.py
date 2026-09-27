from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import os
import tempfile
import uuid
import wave
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from aiokafka import AIOKafkaConsumer, TopicPartition
from sqlalchemy import func, select

from s112.api.scenario_completion import ScenarioCompletionService
from s112.audio.storage import SeaweedStorage, StoredAudioObject
from s112.common.config import Settings
from s112.common.database import Database
from s112.common.enums import AudioMessageKind, AudioMessageStatus
from s112.domain.models import AudioMessage, EventInbox, OutboxEvent, TrainingSession, TtsSegment
from s112.speech_worker.client import SpeechModelClient


logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class ProcessingResult:
    transcript: str | None = None
    stored: StoredAudioObject | None = None
    sample_rate: int | None = None
    duration_ms: int | None = None


class SpeechRequestWorker:
    def __init__(
        self,
        database: Database,
        storage: SeaweedStorage,
        speech: SpeechModelClient,
        settings: Settings,
        *,
        consumer: AIOKafkaConsumer | None = None,
    ) -> None:
        self.database = database
        self.storage = storage
        self.speech = speech
        self.settings = settings
        self.consumer_name = settings.speech_request_consumer_group
        self._consumer = consumer or AIOKafkaConsumer(
            settings.audio_stt_request_topic,
            settings.audio_tts_request_topic,
            bootstrap_servers=settings.kafka_servers,
            group_id=settings.speech_request_consumer_group,
            enable_auto_commit=False,
            auto_offset_reset="earliest",
            max_poll_interval_ms=(
                settings.speech_worker_max_poll_interval_seconds * 1000
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
        data = payload.get("data")
        if not isinstance(data, dict):
            raise ValueError("Audio request event data must be an object")
        if payload.get("event_type") == "audio.tts.segment.requested":
            await self._process_segment(uuid.UUID(str(data["segment_id"])), event_id)
            return
        message_id = uuid.UUID(str(data["audio_message_id"]))

        if await self._is_consumed(event_id):
            return

        while True:
            message = await self._begin_attempt(message_id, event_id)
            if message is None:
                return
            try:
                result = await self._process(message)
            except Exception as exc:
                attempts = await self._record_retry(message_id, exc)
                if attempts >= self.settings.speech_worker_retry_limit:
                    await self._mark_failed(message_id, event_id, exc)
                    return
                delay = min(
                    60.0,
                    self.settings.speech_worker_retry_base_seconds
                    * (2 ** max(0, attempts - 1)),
                )
                logger.warning(
                    "Audio message %s failed on attempt %d; retrying in %.1fs: %s",
                    message_id,
                    attempts,
                    delay,
                    exc,
                )
                await asyncio.sleep(delay)
                continue
            await self._mark_completed(message_id, event_id, result)
            return

    async def _process_segment(self, segment_id: uuid.UUID, event_id: uuid.UUID) -> None:
        if await self._is_consumed(event_id):
            return
        while True:
            async with self.database.write_session_factory() as session:
                async with session.begin():
                    segment = await session.scalar(select(TtsSegment).where(TtsSegment.id == segment_id).with_for_update())
                    if segment is None:
                        raise LookupError(f"TTS segment {segment_id} not found")
                    if segment.status in {"COMPLETED", "FAILED", "CANCELLED"}:
                        session.add(EventInbox(consumer_name=self.consumer_name, event_id=event_id))
                        return
                    segment.status = "PROCESSING"
                    segment.attempts += 1
                    text = segment.text
                    key = segment.object_key
                    attempts = segment.attempts
                    message = await session.get(AudioMessage, segment.audio_message_id)
                    if message is None:
                        raise LookupError(f"Audio message {segment.audio_message_id} not found")
                    if message.status == "FAILED":
                        segment.status = "CANCELLED"
                        session.add(EventInbox(consumer_name=self.consumer_name, event_id=event_id))
                        return
                    metadata = {
                        "Audio-Message-Id": str(message.id),
                        "Training-Call-Id": str(message.training_call_id),
                        "TTS-Segment-Id": str(segment.id),
                        "Generation-Id": str(segment.generation_id),
                        "Segment-No": str(segment.segment_no),
                    }
            try:
                audio, sample_rate = await self.speech.synthesize(text)
                stored = await self.storage.put_bytes(key, audio, content_type="audio/wav", metadata=metadata)
            except Exception as exc:
                async with self.database.write_session_factory() as session:
                    async with session.begin():
                        segment = await session.scalar(select(TtsSegment).where(TtsSegment.id == segment_id).with_for_update())
                        segment.last_error = str(exc)[:4000]
                        if attempts >= self.settings.speech_worker_retry_limit:
                            segment.status = "FAILED"
                            segment.completed_at = utcnow()
                            parent = await session.scalar(select(AudioMessage).where(AudioMessage.id == segment.audio_message_id).with_for_update())
                            parent.status = "FAILED"
                            parent.generation_status = "FAILED"
                            parent.last_error = segment.last_error
                            parent.completed_at = utcnow()
                            self._add_segment_result(session, segment, parent, event_id, success=False)
                            if self._is_outgoing_greeting(parent):
                                self._add_greeting_notification(session, parent, "training.dialogue_failed", {"error": parent.last_error})
                            training_session = await session.scalar(select(TrainingSession).where(TrainingSession.id == parent.training_session_id).with_for_update())
                            await ScenarioCompletionService(self.settings.kafka_topic).refresh(session, training_session)
                            session.add(EventInbox(consumer_name=self.consumer_name, event_id=event_id))
                        else:
                            segment.status = "QUEUED"
                if attempts >= self.settings.speech_worker_retry_limit:
                    return
                await asyncio.sleep(min(60.0, self.settings.speech_worker_retry_base_seconds * 2 ** (attempts - 1)))
                continue
            async with self.database.write_session_factory() as session:
                async with session.begin():
                    if await session.get(EventInbox, (self.consumer_name, event_id)):
                        return
                    segment = await session.scalar(select(TtsSegment).where(TtsSegment.id == segment_id).with_for_update())
                    parent = await session.scalar(select(AudioMessage).where(AudioMessage.id == segment.audio_message_id).with_for_update())
                    if parent.status == "FAILED":
                        segment.status = "CANCELLED"
                        session.add(EventInbox(consumer_name=self.consumer_name, event_id=event_id))
                        return
                    segment.status = "COMPLETED"
                    segment.sha256 = stored.sha256
                    segment.size_bytes = stored.size_bytes
                    segment.content_type = stored.content_type
                    segment.sample_rate = sample_rate
                    segment.completed_at = utcnow()
                    await session.flush()
                    if self._is_outgoing_greeting(parent):
                        parent.generation_status = "COMPLETED"
                        parent.final_segment_count = 1
                    if parent.generation_status == "COMPLETED":
                        remaining = await session.scalar(select(func.count()).select_from(TtsSegment).where(TtsSegment.audio_message_id == parent.id, TtsSegment.status != "COMPLETED"))
                        if remaining == 0:
                            parent.status = "COMPLETED"
                            parent.completed_at = utcnow()
                    self._add_segment_result(session, segment, parent, event_id, success=True)
                    if self._is_outgoing_greeting(parent) and parent.status == "COMPLETED":
                        self._add_greeting_notification(session, parent, "training.dialogue_finished", {"final_segment_count": 1})
                    if parent.status == "COMPLETED":
                        training_session = await session.scalar(select(TrainingSession).where(TrainingSession.id == parent.training_session_id).with_for_update())
                        await ScenarioCompletionService(self.settings.kafka_topic).refresh(session, training_session)
                    session.add(EventInbox(consumer_name=self.consumer_name, event_id=event_id))
            return

    @staticmethod
    def _is_outgoing_greeting(message: AudioMessage) -> bool:
        return (
            message.training_call_id is not None
            and message.idempotency_key == f"outgoing-greeting:{message.training_call_id}"
        )

    def _add_greeting_notification(
        self, session: Any, message: AudioMessage, event_type: str, data: dict[str, Any]
    ) -> None:
        notification_id = uuid.uuid4()
        session.add(OutboxEvent(
            id=notification_id,
            aggregate_type="dialogue_notification",
            aggregate_id=str(message.id),
            aggregate_version=1,
            event_type=event_type,
            topic=self.settings.kafka_topic,
            message_key=str(message.training_call_id),
            payload={
                "schema_version": 1,
                "event_id": str(notification_id),
                "event_type": event_type,
                "aggregate_type": "audio_message",
                "aggregate_id": str(message.id),
                "aggregate_version": 1,
                "workspace_id": str(message.workspace_id),
                "data": {
                    "training_call_id": str(message.training_call_id),
                    "audio_message_id": str(message.id),
                    "reply_to_message_id": None,
                    "generation_id": str(message.generation_id),
                    **data,
                },
            },
        ))

    def _add_segment_result(self, session: Any, segment: TtsSegment, parent: AudioMessage, request_id: uuid.UUID, *, success: bool) -> None:
        result_id = uuid.uuid4()
        event_type = "audio.tts.segment.completed" if success else "audio.tts.segment.failed"
        session.add(OutboxEvent(
            id=result_id,
            aggregate_type="tts_segment",
            aggregate_id=str(segment.id),
            aggregate_version=2,
            event_type=event_type,
            topic=self.settings.audio_tts_result_topic if success else self.settings.audio_failed_topic,
            message_key=str(parent.training_call_id),
            payload={
                "schema_version": 1, "event_id": str(result_id),
                "event_type": event_type, "aggregate_type": "tts_segment",
                "aggregate_id": str(segment.id), "aggregate_version": 2,
                "correlation_id": str(parent.training_call_id), "causation_id": str(request_id),
                "data": {"audio_message_id": str(parent.id), "segment_id": str(segment.id), "segment_no": segment.segment_no},
            },
        ))

    async def _process(self, message: AudioMessage) -> ProcessingResult:
        if message.kind == AudioMessageKind.STT.value:
            suffix = Path(message.object_key).suffix or ".audio"
            descriptor, filename = tempfile.mkstemp(
                prefix="s112-stt-worker-", suffix=suffix
            )
            os.close(descriptor)
            try:
                path = Path(filename)
                await self.storage.download_to_path(message.object_key, path)
                if message.sha256:
                    actual_hash = await asyncio.to_thread(_sha256_file, path)
                    if actual_hash != message.sha256:
                        raise ValueError("Downloaded audio checksum does not match")
                transcript, duration_ms = await self.speech.transcribe(
                    path, message.content_type or "application/octet-stream"
                )
                return ProcessingResult(transcript=transcript, duration_ms=duration_ms)
            finally:
                Path(filename).unlink(missing_ok=True)

        if message.kind == AudioMessageKind.TTS.value:
            if not message.source_text:
                raise ValueError("TTS audio message has no source text")
            audio, sample_rate = await self.speech.synthesize(message.source_text)
            stored = await self.storage.put_bytes(
                message.object_key,
                audio,
                content_type="audio/wav",
                metadata={
                    "Audio-Message-Id": str(message.id),
                    "Training-Session-Id": str(message.training_session_id),
                    "Workspace-Id": str(message.workspace_id),
                    "Incident-Card-Id": (
                        str(message.incident_card_id)
                        if message.incident_card_id
                        else ""
                    ),
                    "Actor-User-Id": (
                        str(message.actor_user_id)
                        if message.actor_user_id
                        else ""
                    ),
                    "Kind": message.kind,
                    "Direction": message.direction,
                    "Sequence-No": str(message.sequence_no),
                    "Created-At": message.created_at.isoformat(),
                },
            )
            try:
                with wave.open(io.BytesIO(audio), "rb") as reader:
                    duration_ms = round(reader.getnframes() * 1000 / reader.getframerate())
            except (EOFError, wave.Error, ZeroDivisionError):
                duration_ms = None
            return ProcessingResult(
                stored=stored, sample_rate=sample_rate, duration_ms=duration_ms
            )
        raise ValueError(f"Unknown audio message kind: {message.kind}")

    async def _is_consumed(self, event_id: uuid.UUID) -> bool:
        async with self.database.write_session_factory() as session:
            return (
                await session.get(EventInbox, (self.consumer_name, event_id))
                is not None
            )

    async def _begin_attempt(
        self, message_id: uuid.UUID, event_id: uuid.UUID
    ) -> AudioMessage | None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                if await session.get(
                    EventInbox, (self.consumer_name, event_id)
                ):
                    return None
                message = await session.scalar(
                    select(AudioMessage)
                    .where(AudioMessage.id == message_id)
                    .with_for_update()
                )
                if message is None:
                    session.add(
                        EventInbox(
                            consumer_name=self.consumer_name, event_id=event_id
                        )
                    )
                    return None
                if message.status in {
                    AudioMessageStatus.COMPLETED.value,
                    AudioMessageStatus.FAILED.value,
                }:
                    session.add(
                        EventInbox(
                            consumer_name=self.consumer_name, event_id=event_id
                        )
                    )
                    return None
                if message.attempts >= self.settings.speech_worker_retry_limit:
                    failure_error = message.last_error or "Retry limit reached"
                    message.last_error = failure_error
                    self._add_failure_outbox(
                        session,
                        message,
                        failure_error,
                        request_event_id=event_id,
                    )
                    message.status = AudioMessageStatus.FAILED.value
                    message.revision = 2
                    message.completed_at = utcnow()
                    session.add(
                        EventInbox(
                            consumer_name=self.consumer_name, event_id=event_id
                        )
                    )
                    return None
                message.status = AudioMessageStatus.PROCESSING.value
                message.processing_started_at = utcnow()
                message.attempts += 1
                await session.flush()
                session.expunge(message)
                return message

    async def _record_retry(self, message_id: uuid.UUID, error: Exception) -> int:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                message = await session.scalar(
                    select(AudioMessage)
                    .where(AudioMessage.id == message_id)
                    .with_for_update()
                )
                if message is None:
                    return self.settings.speech_worker_retry_limit
                message.status = AudioMessageStatus.QUEUED.value
                message.last_error = str(error)[:4000]
                return message.attempts

    async def _mark_completed(
        self,
        message_id: uuid.UUID,
        request_event_id: uuid.UUID,
        result: ProcessingResult,
    ) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                if await session.get(
                    EventInbox, (self.consumer_name, request_event_id)
                ):
                    return
                message = await session.scalar(
                    select(AudioMessage)
                    .where(AudioMessage.id == message_id)
                    .with_for_update()
                )
                if message is None:
                    raise LookupError(f"Audio message {message_id} not found")
                message.status = AudioMessageStatus.COMPLETED.value
                message.revision = 2
                message.transcript = result.transcript
                if result.stored is not None:
                    message.object_etag = result.stored.etag
                    message.sha256 = result.stored.sha256
                    message.content_type = result.stored.content_type
                    message.size_bytes = result.stored.size_bytes
                message.sample_rate = result.sample_rate
                message.duration_ms = result.duration_ms
                message.last_error = None
                message.completed_at = utcnow()
                self._add_result_outbox(session, message, request_event_id)
                session.add(
                    EventInbox(
                        consumer_name=self.consumer_name,
                        event_id=request_event_id,
                    )
                )

    async def _mark_failed(
        self,
        message_id: uuid.UUID,
        request_event_id: uuid.UUID,
        error: Exception,
    ) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                if await session.get(
                    EventInbox, (self.consumer_name, request_event_id)
                ):
                    return
                message = await session.scalar(
                    select(AudioMessage)
                    .where(AudioMessage.id == message_id)
                    .with_for_update()
                )
                if message is None:
                    session.add(
                        EventInbox(
                            consumer_name=self.consumer_name,
                            event_id=request_event_id,
                        )
                    )
                    return
                message.status = AudioMessageStatus.FAILED.value
                message.revision = 2
                message.last_error = str(error)[:4000]
                message.completed_at = utcnow()
                self._add_failure_outbox(
                    session,
                    message,
                    str(error),
                    request_event_id=request_event_id,
                )
                session.add(
                    EventInbox(
                        consumer_name=self.consumer_name,
                        event_id=request_event_id,
                    )
                )

    def _add_result_outbox(
        self,
        session: Any,
        message: AudioMessage,
        request_event_id: uuid.UUID,
    ) -> None:
        is_stt = message.kind == AudioMessageKind.STT.value
        event_id = uuid.uuid4()
        event_type = "audio.stt.completed" if is_stt else "audio.tts.completed"
        topic = (
            self.settings.audio_stt_result_topic
            if is_stt
            else self.settings.audio_tts_result_topic
        )
        session.add(
            OutboxEvent(
                id=event_id,
                aggregate_type="audio_message",
                aggregate_id=str(message.id),
                aggregate_version=message.revision,
                event_type=event_type,
                topic=topic,
                message_key=str(message.training_session_id),
                payload=self._event_payload(
                    event_id,
                    event_type,
                    message,
                    request_event_id,
                ),
            )
        )

    def _add_failure_outbox(
        self,
        session: Any,
        message: AudioMessage,
        error: str,
        *,
        request_event_id: uuid.UUID,
    ) -> None:
        event_id = uuid.uuid4()
        event_type = (
            "audio.stt.failed"
            if message.kind == AudioMessageKind.STT.value
            else "audio.tts.failed"
        )
        payload = self._event_payload(
            event_id,
            event_type,
            message,
            request_event_id,
        )
        payload["data"]["error"] = error[:4000]
        session.add(
            OutboxEvent(
                id=event_id,
                aggregate_type="audio_message",
                aggregate_id=str(message.id),
                aggregate_version=2,
                event_type=event_type,
                topic=self.settings.audio_failed_topic,
                message_key=str(message.training_session_id),
                payload=payload,
            )
        )

    @staticmethod
    def _event_payload(
        event_id: uuid.UUID,
        event_type: str,
        message: AudioMessage,
        request_event_id: uuid.UUID | None,
    ) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "event_id": str(event_id),
            "event_type": event_type,
            "aggregate_type": "audio_message",
            "aggregate_id": str(message.id),
            "aggregate_version": 2,
            "occurred_at": utcnow().isoformat(),
            "correlation_id": str(message.id),
            "causation_id": str(request_event_id) if request_event_id else None,
            "data": {
                "audio_message_id": str(message.id),
                "training_session_id": str(message.training_session_id),
                "workspace_id": str(message.workspace_id),
                "incident_card_id": (
                    str(message.incident_card_id)
                    if message.incident_card_id
                    else None
                ),
                "actor_user_id": (
                    str(message.actor_user_id) if message.actor_user_id else None
                ),
                "kind": message.kind,
                "direction": message.direction,
                "sequence_no": message.sequence_no,
                "transcript": message.transcript,
                "object_key": message.object_key,
                "object_etag": message.object_etag,
                "sha256": message.sha256,
                "content_type": message.content_type,
                "size_bytes": message.size_bytes,
                "sample_rate": message.sample_rate,
                "attempts": message.attempts,
            },
        }

    @staticmethod
    def _decode_event(raw_value: bytes) -> dict[str, Any]:
        value = json.loads(raw_value.decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("Kafka audio event must be an object")
        return value


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()
