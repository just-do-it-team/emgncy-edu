from __future__ import annotations

import asyncio
import hashlib
import logging
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import and_, or_, select

from s112.audio.storage import SeaweedStorage
from s112.common.config import Settings
from s112.common.database import Database
from s112.common.enums import AudioMessageKind, AudioMessageStatus
from s112.domain.models import AudioMessage, TrainingCall, TrainingCallRecording, TtsSegment
from s112.speech_worker.client import SpeechModelClient


logger = logging.getLogger(__name__)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True, slots=True)
class RecordingSource:
    object_key: str
    sha256: str | None
    message_id: uuid.UUID
    segment_id: uuid.UUID | None
    sequence_no: int

    def manifest_entry(self) -> dict[str, str | int | None]:
        return {
            "audio_message_id": str(self.message_id),
            "tts_segment_id": str(self.segment_id) if self.segment_id else None,
            "sequence_no": self.sequence_no,
        }


class CallRecordingWorker:
    def __init__(
        self,
        database: Database,
        storage: SeaweedStorage,
        speech: SpeechModelClient,
        settings: Settings,
    ) -> None:
        self.database = database
        self.storage = storage
        self.speech = speech
        self.settings = settings
        self._stop_event = asyncio.Event()

    def stop(self) -> None:
        self._stop_event.set()

    async def run(self) -> None:
        while not self._stop_event.is_set():
            try:
                if await self.run_once():
                    continue
            except Exception:
                logger.exception("Call recording worker failed")
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=2)
            except asyncio.TimeoutError:
                pass

    async def run_once(self) -> bool:
        now = utcnow()
        async with self.database.write_session_factory() as session:
            async with session.begin():
                recording = await session.scalar(
                    select(TrainingCallRecording)
                    .where(
                        or_(
                            and_(
                                TrainingCallRecording.status == "QUEUED",
                                or_(
                                    TrainingCallRecording.next_attempt_at.is_(None),
                                    TrainingCallRecording.next_attempt_at <= now,
                                ),
                            ),
                            and_(
                                TrainingCallRecording.status == "PROCESSING",
                                TrainingCallRecording.processing_started_at
                                <= now - timedelta(minutes=10),
                            ),
                        )
                    )
                    .order_by(TrainingCallRecording.created_at)
                    .limit(1)
                    .with_for_update(skip_locked=True)
                )
                if recording is None:
                    return False
                recording.status = "PROCESSING"
                recording.processing_started_at = now
                call_id = recording.training_call_id

        try:
            source_state, sources, training_session_id = await self._sources(call_id)
            if source_state == "WAITING":
                await self._queue_again(call_id, now, delay_seconds=2)
                return True
            if source_state == "FAILED" or not sources:
                await self._fail(call_id, now, "Call audio is incomplete or unavailable")
                return True
            if len(sources) > 500:
                await self._fail(call_id, now, "Call contains more than 500 audio clips")
                return True

            with tempfile.TemporaryDirectory(prefix="s112-recording-source-") as directory:
                paths = []
                for index, source in enumerate(sources):
                    suffix = Path(source.object_key).suffix or ".audio"
                    path = Path(directory) / f"clip-{index}{suffix}"
                    await self.storage.download_to_path(source.object_key, path)
                    if source.sha256 and await asyncio.to_thread(_sha256_file, path) != source.sha256:
                        raise ValueError("Call audio checksum mismatch")
                    paths.append(path)
                content, duration_ms = await self.speech.compose_call_recording(paths)

            object_key = (
                f"{self.settings.seaweed_audio_prefix.rstrip('/')}"
                f"/{training_session_id}/calls/{call_id}/recording-{uuid.uuid4()}.mp3"
            )
            stored = await self.storage.put_bytes(
                object_key,
                content,
                content_type="audio/mpeg",
                metadata={"Training-Call-Id": str(call_id)},
            )
            async with self.database.write_session_factory() as session:
                async with session.begin():
                    recording = await session.get(TrainingCallRecording, call_id, with_for_update=True)
                    if recording is None or recording.status != "PROCESSING" or recording.processing_started_at != now:
                        return True
                    recording.status = "READY"
                    recording.object_key = stored.object_key
                    recording.content_type = stored.content_type
                    recording.size_bytes = stored.size_bytes
                    recording.sha256 = stored.sha256
                    recording.duration_ms = duration_ms
                    recording.source_manifest = [source.manifest_entry() for source in sources]
                    recording.completed_at = utcnow()
                    recording.next_attempt_at = None
                    recording.processing_started_at = None
                    recording.last_error = None
            return True
        except Exception as exc:
            logger.exception("Could not assemble recording for call %s", call_id)
            await self._retry_or_fail(call_id, now, str(exc))
            return True

    async def _sources(self, call_id: uuid.UUID) -> tuple[str, list[RecordingSource], uuid.UUID]:
        async with self.database.write_session_factory() as session:
            call = await session.get(TrainingCall, call_id)
            if call is None or call.status != "COMPLETED":
                raise ValueError("Training call is not completed")
            messages = list(await session.scalars(
                select(AudioMessage)
                .where(AudioMessage.training_call_id == call_id)
                .order_by(AudioMessage.sequence_no, AudioMessage.id)
            ))
            sources: list[RecordingSource] = []
            for message in messages:
                if message.kind == AudioMessageKind.TTS.value and message.speaker_role == "TRAINEE":
                    continue  # Legacy text input; its uploaded STT audio is the call utterance.
                if message.status == AudioMessageStatus.FAILED.value:
                    return "FAILED", [], call.training_session_id
                if message.status != AudioMessageStatus.COMPLETED.value:
                    return "WAITING", [], call.training_session_id
                if message.kind == AudioMessageKind.TTS.value and message.generation_id is not None:
                    segments = list(await session.scalars(
                        select(TtsSegment)
                        .where(
                            TtsSegment.audio_message_id == message.id,
                            TtsSegment.generation_id == message.generation_id,
                        )
                        .order_by(TtsSegment.segment_no)
                    ))
                    if any(segment.status in {"FAILED", "CANCELLED"} for segment in segments):
                        return "FAILED", [], call.training_session_id
                    if message.final_segment_count is None or len(segments) != message.final_segment_count:
                        return "WAITING", [], call.training_session_id
                    if any(segment.status != "COMPLETED" for segment in segments):
                        return "WAITING", [], call.training_session_id
                    for segment in segments:
                        if not segment.object_key or segment.size_bytes is None:
                            return "FAILED", [], call.training_session_id
                        sources.append(RecordingSource(
                            segment.object_key, segment.sha256, message.id, segment.id,
                            message.sequence_no,
                        ))
                elif message.object_key and message.size_bytes is not None:
                    sources.append(RecordingSource(
                        message.object_key, message.sha256, message.id, None,
                        message.sequence_no,
                    ))
                else:
                    return "FAILED", [], call.training_session_id
            return "READY", sources, call.training_session_id

    async def _queue_again(self, call_id: uuid.UUID, claimed_at: datetime, *, delay_seconds: int) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                recording = await session.get(TrainingCallRecording, call_id, with_for_update=True)
                if recording is None or recording.status != "PROCESSING" or recording.processing_started_at != claimed_at:
                    return
                recording.status = "QUEUED"
                recording.processing_started_at = None
                recording.next_attempt_at = utcnow() + timedelta(seconds=delay_seconds)

    async def _fail(self, call_id: uuid.UUID, claimed_at: datetime, error: str) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                recording = await session.get(TrainingCallRecording, call_id, with_for_update=True)
                if recording is None or recording.status != "PROCESSING" or recording.processing_started_at != claimed_at:
                    return
                recording.status = "FAILED"
                recording.processing_started_at = None
                recording.last_error = error[:2000]

    async def _retry_or_fail(self, call_id: uuid.UUID, claimed_at: datetime, error: str) -> None:
        async with self.database.write_session_factory() as session:
            async with session.begin():
                recording = await session.get(TrainingCallRecording, call_id, with_for_update=True)
                if recording is None or recording.status != "PROCESSING" or recording.processing_started_at != claimed_at:
                    return
                recording.attempts += 1
                recording.last_error = error[:2000]
                recording.processing_started_at = None
                if recording.attempts >= 5:
                    recording.status = "FAILED"
                else:
                    recording.status = "QUEUED"
                    recording.next_attempt_at = utcnow() + timedelta(seconds=2 ** recording.attempts)


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()
