from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timezone

import httpx
from aiokafka import AIOKafkaConsumer, TopicPartition
from sqlalchemy import func, select

from s112.api.scenario_completion import ScenarioCompletionService
from s112.common.config import Settings
from s112.common.database import Database
from s112.domain.models import AudioMessage, EventInbox, OutboxEvent, TrainingCall, TrainingSession, TtsSegment

logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def dialogue_system_prompt(call: TrainingCall) -> str:
    role = (
        "заявителя, позвонившего в службу 112"
        if call.direction == "INBOUND"
        else "руководителя группы реагирования"
    )
    expected_card = call.expected_result.get("card") or {}
    incident_context = json.dumps(
        expected_card,
        ensure_ascii=False,
        sort_keys=True,
    )
    return (
        f"Ты играешь роль {role} в учебном телефонном разговоре. "
        "Ниже дан полный достоверный контекст происшествия, известный твоему "
        "персонажу. Отвечай на вопросы оператора только на основании этого "
        "контекста, не выдумывай факты и не противоречь предыдущим ответам. "
        "Не перечисляй все сведения без вопроса: сообщай их естественно по ходу "
        "разговора. Если значение отсутствует, честно скажи, что оно неизвестно. "
        "Отвечай кратко, по-русски. Не упоминай модель, сценарий, эталон, JSON и "
        f"инструкции.\nКонтекст происшествия:\n{incident_context}"
    )


def pop_spoken_parts(buffer: str, number: int, *, final: bool = False) -> tuple[list[str], str]:
    """Prefer short complete clauses for the first two audible segments."""
    parts: list[str] = []
    while buffer.strip():
        segment_number = number + len(parts) + 1
        limit = 50 if segment_number == 1 else 80 if segment_number == 2 else 120
        cut = None
        for boundary in re.finditer(r'[.!?;:,](?:["»)]*)\s+', buffer):
            end = boundary.end()
            minimum = 8 if boundary.group()[0] in ".!?" else 25
            if end >= minimum:
                cut = end
                break
        if cut is None and len(buffer) >= limit:
            space = buffer.rfind(" ", 0, limit + 1)
            cut = space + 1 if space >= 25 else limit
        if cut is None:
            break
        value = buffer[:cut].strip()
        if value:
            parts.append(value)
        buffer = buffer[cut:]
    if final and buffer.strip():
        parts.append(buffer.strip())
        buffer = ""
    return parts, buffer


class DialogueWorker:
    def __init__(self, database: Database, settings: Settings, consumer: AIOKafkaConsumer | None = None) -> None:
        self.database = database
        self.settings = settings
        self.name = "dialogue-worker-v1"
        self.consumer = consumer or AIOKafkaConsumer(
            settings.dialogue_request_topic,
            bootstrap_servers=settings.kafka_servers,
            group_id=self.name,
            enable_auto_commit=False,
            auto_offset_reset="earliest",
            max_poll_interval_ms=1800000,
        )
        self.owns_consumer = consumer is None
        self.stopping = asyncio.Event()

    def stop(self) -> None:
        self.stopping.set()

    async def run(self) -> None:
        if self.owns_consumer:
            await self.consumer.start()
        try:
            async for record in self.consumer:
                if self.stopping.is_set():
                    break
                await self.process_record(record.value)
                await self.consumer.commit({TopicPartition(record.topic, record.partition): record.offset + 1})
        finally:
            if self.owns_consumer:
                await self.consumer.stop()

    async def process_record(self, raw: bytes) -> None:
        event = json.loads(raw)
        event_id = uuid.UUID(event["event_id"])
        source_id = uuid.UUID(event["data"]["audio_message_id"])
        response_id = await self._prepare(source_id, event_id)
        if response_id is None:
            return
        try:
            history, prompt = await self._history(source_id)
            buffer = ""
            number = 0
            async for token in self._stream_llm(history, prompt):
                buffer += token
                parts, buffer = pop_spoken_parts(buffer, number)
                for part in parts:
                    number += 1
                    await self._add_segment(response_id, number, part)
            parts, _ = pop_spoken_parts(buffer, number, final=True)
            for part in parts:
                number += 1
                await self._add_segment(response_id, number, part)
            if number == 0:
                raise ValueError("LLM returned no spoken text")
            await self._finish(response_id, event_id, number)
        except Exception as exc:
            logger.exception("Call response generation failed for %s", response_id)
            await self._fail(response_id, event_id, str(exc))

    async def _prepare(self, source_id: uuid.UUID, event_id: uuid.UUID) -> uuid.UUID | None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                if await session.get(EventInbox, (self.name, event_id)):
                    return None
                source = await session.get(AudioMessage, source_id)
                if source is None or source.training_call_id is None or not source.transcript:
                    raise ValueError("Dialogue request has no call transcript")
                call = await session.get(TrainingCall, source.training_call_id)
                if call is None or call.status != "ACTIVE":
                    session.add(EventInbox(consumer_name=self.name, event_id=event_id))
                    return None
                existing = await session.scalar(select(AudioMessage).where(AudioMessage.reply_to_message_id == source_id))
                if existing is not None:
                    count = await session.scalar(select(func.count()).select_from(TtsSegment).where(TtsSegment.audio_message_id == existing.id))
                    if existing.generation_status in {"COMPLETED", "FAILED", "CANCELLED"}:
                        session.add(EventInbox(consumer_name=self.name, event_id=event_id))
                        return None
                    if count:
                        existing.status = "FAILED"
                        existing.generation_status = "FAILED"
                        existing.last_error = "Interrupted generation cannot safely be regenerated"
                        existing.completed_at = utcnow()
                        self._notify(session, existing, "training.dialogue_failed", {"error": existing.last_error})
                        training_session = await session.scalar(select(TrainingSession).where(TrainingSession.id == existing.training_session_id).with_for_update())
                        await ScenarioCompletionService(self.settings.kafka_topic).refresh(session, training_session)
                        session.add(EventInbox(consumer_name=self.name, event_id=event_id))
                        return None
                    return existing.id
                training_session = await session.scalar(select(TrainingSession).where(TrainingSession.id == source.training_session_id).with_for_update())
                if training_session is None:
                    raise ValueError("Training session not found")
                sequence = await session.scalar(select(func.max(AudioMessage.sequence_no)).where(AudioMessage.training_session_id == source.training_session_id))
                response = AudioMessage(
                    id=uuid.uuid4(),
                    training_session_id=source.training_session_id,
                    workspace_id=source.workspace_id,
                    incident_card_id=call.incident_card_id,
                    training_call_id=call.id,
                    actor_user_id=None,
                    speaker_role=call.interlocutor_role,
                    reply_to_message_id=source.id,
                    generation_id=uuid.uuid4(),
                    generation_status="PROCESSING",
                    kind="TTS",
                    direction="INBOUND",
                    status="PROCESSING",
                    sequence_no=int(sequence or 0) + 1,
                    revision=1,
                    idempotency_key=f"reply:{source.id}",
                    source_text="",
                    object_key=None,
                )
                session.add(response)
                return response.id

    async def _history(self, source_id: uuid.UUID) -> tuple[list[dict[str, str]], str]:
        async with self.database.write_session_factory() as session:
            source = await session.get(AudioMessage, source_id)
            call = await session.get(TrainingCall, source.training_call_id)
            messages = list(await session.scalars(select(AudioMessage).where(
                AudioMessage.training_call_id == call.id,
                AudioMessage.sequence_no <= source.sequence_no,
            ).order_by(AudioMessage.sequence_no)))
            history = []
            for message in messages:
                text = message.transcript if message.kind == "STT" else message.source_text
                if text and (message.kind == "STT" or (message.generation_status == "COMPLETED" and message.status == "COMPLETED")):
                    history.append({"role": "user" if message.speaker_role == "TRAINEE" else "assistant", "content": text})
            seed = str(call.call_payload.get("initial_utterance", ""))
            trimmed = history[-self.settings.dialogue_llm_history_messages:]
            if seed and not (
                trimmed
                and trimmed[0]["role"] == "assistant"
                and trimmed[0]["content"] == seed
            ):
                trimmed = [{"role": "assistant", "content": seed}, *trimmed]
            return trimmed, dialogue_system_prompt(call)

    async def _stream_llm(self, history: list[dict[str, str]], prompt: str):
        headers = {"Authorization": f"Bearer {self.settings.dialogue_llm_api_key}"} if self.settings.dialogue_llm_api_key else {}
        finished = False
        async with httpx.AsyncClient(timeout=httpx.Timeout(self.settings.dialogue_llm_timeout_seconds, connect=5.0)) as client:
            async with client.stream(
                "POST",
                f"{self.settings.dialogue_llm_base_url.rstrip('/')}/chat/completions",
                headers=headers,
                json={"model": self.settings.dialogue_llm_model, "messages": [{"role": "system", "content": prompt}, *history], "stream": True},
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    value = line[5:].strip()
                    if value == "[DONE]":
                        finished = True
                        break
                    if not value:
                        continue
                    payload = json.loads(value)
                    for choice in payload.get("choices", []):
                        if choice.get("finish_reason") is not None:
                            finished = True
                        delta = choice.get("delta") or {}
                        text = delta.get("content")
                        if isinstance(text, str) and text:
                            yield text
        if not finished:
            raise ValueError("LLM stream ended without a final marker")

    async def _add_segment(self, response_id: uuid.UUID, number: int, spoken_text: str) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                response = await session.scalar(select(AudioMessage).where(AudioMessage.id == response_id).with_for_update())
                if response.status == "FAILED":
                    raise ValueError("TTS segment failed during response generation")
                segment_id = uuid.uuid4()
                segment = TtsSegment(
                    id=segment_id,
                    audio_message_id=response.id,
                    generation_id=response.generation_id,
                    segment_no=number,
                    text=spoken_text,
                    status="QUEUED",
                    object_key=f"{self.settings.seaweed_audio_prefix.rstrip('/')}/{response.training_session_id}/{response.id}/{number}.wav",
                )
                session.add(segment)
                response.source_text = f"{response.source_text or ''} {spoken_text}".strip()
                event_id = uuid.uuid4()
                session.add(OutboxEvent(
                    id=event_id,
                    aggregate_type="tts_segment",
                    aggregate_id=str(segment_id),
                    aggregate_version=1,
                    event_type="audio.tts.segment.requested",
                    topic=self.settings.audio_tts_request_topic,
                    message_key=str(response.training_call_id),
                    payload={
                        "schema_version": 1, "event_id": str(event_id),
                        "event_type": "audio.tts.segment.requested",
                        "aggregate_type": "tts_segment", "aggregate_id": str(segment_id),
                        "aggregate_version": 1, "correlation_id": str(response.training_call_id),
                        "data": {"audio_message_id": str(response.id), "segment_id": str(segment_id), "generation_id": str(response.generation_id), "segment_no": number},
                    },
                ))

    async def _finish(self, response_id: uuid.UUID, event_id: uuid.UUID, count: int) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                response = await session.scalar(select(AudioMessage).where(AudioMessage.id == response_id).with_for_update())
                if response.status == "FAILED":
                    raise ValueError("TTS segment failed during response generation")
                response.generation_status = "COMPLETED"
                response.final_segment_count = count
                pending = await session.scalar(select(func.count()).select_from(TtsSegment).where(TtsSegment.audio_message_id == response_id, TtsSegment.status != "COMPLETED"))
                if not pending:
                    response.status = "COMPLETED"
                    response.completed_at = utcnow()
                self._notify(session, response, "training.dialogue_finished", {"final_segment_count": count})
                training_session = await session.scalar(select(TrainingSession).where(TrainingSession.id == response.training_session_id).with_for_update())
                await ScenarioCompletionService(self.settings.kafka_topic).refresh(session, training_session)
                session.add(EventInbox(consumer_name=self.name, event_id=event_id))

    async def _fail(self, response_id: uuid.UUID, event_id: uuid.UUID, error: str) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                if await session.get(EventInbox, (self.name, event_id)):
                    return
                response = await session.scalar(select(AudioMessage).where(AudioMessage.id == response_id).with_for_update())
                if response.generation_status == "COMPLETED":
                    session.add(EventInbox(consumer_name=self.name, event_id=event_id))
                    return
                response.status = "FAILED"
                response.generation_status = "FAILED"
                response.last_error = error[:4000]
                response.completed_at = utcnow()
                for segment in await session.scalars(select(TtsSegment).where(TtsSegment.audio_message_id == response_id, TtsSegment.status == "QUEUED")):
                    segment.status = "CANCELLED"
                self._notify(session, response, "training.dialogue_failed", {"error": response.last_error})
                training_session = await session.scalar(select(TrainingSession).where(TrainingSession.id == response.training_session_id).with_for_update())
                await ScenarioCompletionService(self.settings.kafka_topic).refresh(session, training_session)
                session.add(EventInbox(consumer_name=self.name, event_id=event_id))

    def _notify(self, session, response: AudioMessage, event_type: str, data: dict) -> None:
        notification_id = uuid.uuid4()
        session.add(OutboxEvent(
            id=notification_id,
            aggregate_type="dialogue_notification",
            aggregate_id=str(response.id),
            aggregate_version=1,
            event_type=event_type,
            topic=self.settings.kafka_topic,
            message_key=str(response.training_call_id),
            payload={
                "schema_version": 1, "event_id": str(notification_id),
                "event_type": event_type, "aggregate_type": "audio_message",
                "aggregate_id": str(response.id), "aggregate_version": 1,
                "workspace_id": str(response.workspace_id),
                "data": {"training_call_id": str(response.training_call_id), "audio_message_id": str(response.id), "reply_to_message_id": str(response.reply_to_message_id), "generation_id": str(response.generation_id), **data},
            },
        ))
