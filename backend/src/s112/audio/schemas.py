from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TTSMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)
    client_sent_at: datetime | None = None

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("text must not be blank")
        return normalized


class AudioMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    training_session_id: uuid.UUID
    workspace_id: uuid.UUID
    incident_card_id: uuid.UUID | None
    training_call_id: uuid.UUID | None
    actor_user_id: uuid.UUID | None
    speaker_role: str
    reply_to_message_id: uuid.UUID | None
    generation_id: uuid.UUID | None
    generation_status: str | None
    final_segment_count: int | None
    kind: str
    direction: str
    status: str
    sequence_no: int
    revision: int
    idempotency_key: str
    source_text: str | None
    transcript: str | None
    content_type: str | None
    size_bytes: int | None
    sample_rate: int | None
    attempts: int
    last_error: str | None
    client_sent_at: datetime | None
    created_at: datetime
    processing_started_at: datetime | None
    completed_at: datetime | None
    action_recorded_at: datetime | None
    content_url: str | None = None
    idempotent_replay: bool = False


class TtsSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    audio_message_id: uuid.UUID
    generation_id: uuid.UUID
    segment_no: int
    text: str
    status: str
    sample_rate: int | None
    size_bytes: int | None
    last_error: str | None
    content_url: str | None = None
