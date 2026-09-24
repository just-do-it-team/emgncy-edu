import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.dependencies import get_read_session
from s112.api.simulation_schemas import CallTranscriptResponse, CallTranscriptUtterance
from s112.audio.access import can_access_training_call
from s112.common.enums import AudioMessageKind, AudioMessageStatus
from s112.domain.models import (
    AudioMessage,
    TrainingCall,
    TtsSegment,
)


router = APIRouter(prefix="/api/v1", tags=["common/training"])


@router.get(
    "/training-calls/{call_id}/transcript",
    response_model=CallTranscriptResponse,
)
async def get_call_transcript(
    call_id: uuid.UUID,
    request: Request,
    response: Response,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> CallTranscriptResponse:
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, "principal", None)
        if principal is None or principal.user_id != user_id:
            raise HTTPException(status_code=403, detail="User does not match token")

    call = await session.get(TrainingCall, call_id)
    if call is None or not await can_access_training_call(session, call, user_id):
        raise HTTPException(status_code=404, detail="Training call not found")

    messages = list(
        await session.scalars(
            select(AudioMessage)
            .where(
                AudioMessage.training_call_id == call.id,
                AudioMessage.status == AudioMessageStatus.COMPLETED.value,
            )
            .order_by(AudioMessage.sequence_no, AudioMessage.id)
        )
    )
    generated_messages = {
        message.id: message.generation_id
        for message in messages
        if message.kind == AudioMessageKind.TTS.value
        and message.speaker_role != "TRAINEE"
        and message.generation_id is not None
    }
    segment_urls: dict[uuid.UUID, list[str]] = defaultdict(list)
    if generated_messages:
        segments = await session.scalars(
            select(TtsSegment)
            .where(
                TtsSegment.audio_message_id.in_(generated_messages),
                TtsSegment.status == AudioMessageStatus.COMPLETED.value,
                TtsSegment.size_bytes.is_not(None),
            )
            .order_by(TtsSegment.audio_message_id, TtsSegment.segment_no)
        )
        for segment in segments:
            if segment.generation_id != generated_messages[segment.audio_message_id]:
                continue
            segment_urls[segment.audio_message_id].append(
                f"/api/v1/tts-segments/{segment.id}/content"
            )

    utterances = []
    for message in messages:
        is_voice = message.kind == AudioMessageKind.STT.value
        text = message.transcript if is_voice else message.source_text
        if not text:
            continue
        is_operator = message.speaker_role == "TRAINEE"
        audio_urls = list(segment_urls.get(message.id, []))
        if not audio_urls and message.object_key and message.size_bytes is not None:
            audio_urls = [f"/api/v1/audio-messages/{message.id}/content"]
        utterances.append(
            CallTranscriptUtterance(
                id=message.id,
                speaker=(
                    "OPERATOR" if is_operator
                    else "RESPONSE_LEAD" if message.speaker_role == "COMMANDER"
                    else "CALLER"
                ),
                input_mode=(
                    "VOICE" if is_voice else "TEXT" if is_operator else "GENERATED"
                ),
                sequence_no=message.sequence_no,
                created_at=message.created_at,
                text=text,
                audio_urls=audio_urls,
            )
        )

    response.headers["Cache-Control"] = "private, no-store"
    return CallTranscriptResponse(
        call_id=call.id,
        training_session_id=call.training_session_id,
        answered_at=call.answered_at,
        completed_at=call.completed_at,
        utterances=utterances,
    )
