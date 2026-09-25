import hashlib
import re
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.dependencies import get_read_session
from s112.audio.access import can_access_training_call
from s112.audio.storage import AudioStorageError
from s112.domain.models import TrainingCall, TrainingCallRecording


router = APIRouter(prefix="/api/v1", tags=["common/training"])
_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


class CallRecordingResponse(BaseModel):
    call_id: uuid.UUID
    status: Literal["QUEUED", "PROCESSING", "READY", "FAILED"]
    content_type: str | None
    duration_ms: int | None
    size_bytes: int | None
    completed_at: datetime | None
    content_url: str | None
    last_error: str | None


async def _get_recording(
    call_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID,
    session: AsyncSession,
) -> TrainingCallRecording:
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, "principal", None)
        if principal is None or principal.user_id != user_id:
            raise HTTPException(status_code=403, detail="User does not match token")
    call = await session.get(TrainingCall, call_id)
    if call is None or not await can_access_training_call(session, call, user_id):
        raise HTTPException(status_code=404, detail="Training call not found")
    if call.direction != "INBOUND":
        raise HTTPException(status_code=404, detail="Call recording not found")
    if call.status != "COMPLETED":
        raise HTTPException(status_code=409, detail="Training call is not completed")
    recording = await session.get(TrainingCallRecording, call_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Call recording not found")
    return recording


@router.get(
    "/training-calls/{call_id}/recording",
    response_model=CallRecordingResponse,
)
async def get_call_recording(
    call_id: uuid.UUID,
    request: Request,
    response: Response,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_read_session),
) -> CallRecordingResponse:
    recording = await _get_recording(call_id, request, user_id, session)
    response.headers["Cache-Control"] = "private, no-store"
    return CallRecordingResponse(
        call_id=call_id,
        status=recording.status,
        content_type=recording.content_type,
        duration_ms=recording.duration_ms,
        size_bytes=recording.size_bytes,
        completed_at=recording.completed_at,
        content_url=(
            f"/api/v1/training-calls/{call_id}/recording/content"
            if recording.status == "READY" else None
        ),
        last_error="Call recording could not be created" if recording.status == "FAILED" else None,
    )


@router.get("/training-calls/{call_id}/recording/content")
async def get_call_recording_content(
    call_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    byte_range: str | None = Header(default=None, alias="Range"),
    session: AsyncSession = Depends(get_read_session),
) -> Response:
    recording = await _get_recording(call_id, request, user_id, session)
    if recording.status != "READY" or recording.object_key is None:
        raise HTTPException(status_code=409, detail="Call recording is not ready")
    try:
        content, _ = await request.app.state.audio_storage.get_bytes(recording.object_key)
    except AudioStorageError as exc:
        raise HTTPException(status_code=503, detail="Call recording is unavailable") from exc
    if recording.sha256 and hashlib.sha256(content).hexdigest() != recording.sha256:
        raise HTTPException(status_code=503, detail="Call recording checksum mismatch")

    size = len(content)
    headers = {
        "Cache-Control": "private, no-store",
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="training-call-{call_id}.mp3"',
    }
    if recording.sha256:
        headers["ETag"] = f'"{recording.sha256}"'
    if byte_range is None:
        return Response(content=content, media_type="audio/mpeg", headers=headers)
    match = _RANGE.fullmatch(byte_range) if len(byte_range) <= 100 else None
    if match is None or size == 0 or not any(match.groups()):
        raise HTTPException(status_code=416, detail="Invalid byte range", headers={"Content-Range": f"bytes */{size}"})
    first, last = match.groups()
    if first:
        start = int(first)
        end = min(int(last), size - 1) if last else size - 1
    else:
        length = int(last)
        start = max(0, size - length)
        end = size - 1
    if start >= size or end < start or (not first and int(last) == 0):
        raise HTTPException(status_code=416, detail="Invalid byte range", headers={"Content-Range": f"bytes */{size}"})
    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return Response(
        content=content[start:end + 1],
        status_code=206,
        media_type="audio/mpeg",
        headers=headers,
    )
