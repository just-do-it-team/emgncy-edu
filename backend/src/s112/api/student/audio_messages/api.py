from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from s112.api.common.dependencies import raise_http_error
from s112.api.dependencies import get_write_session
from s112.api.service import DomainError
from s112.audio.schemas import AudioMessageResponse, TtsSegmentResponse
from s112.audio.service import AudioMessageService
from s112.audio.storage import (
    AudioStorageError,
    AudioTooLargeError,
    InvalidAudioError,
    SeaweedStorage,
)
from s112.common.enums import AudioMessageDirection
from s112.domain.models import AudioMessage, TtsSegment
from sqlalchemy import select


router = APIRouter(prefix="/api/v1", tags=["student/audio_messages"])

SUPPORTED_AUDIO_TYPES = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/x-m4a": ".m4a",
}


@router.get("/call-audio-config")
async def call_audio_config(request: Request) -> dict[str, int]:
    return {"vad_silence_ms": request.app.state.settings.call_vad_silence_ms}


def _service(request: Request) -> AudioMessageService:
    return AudioMessageService(request.app.state.settings)


def _storage(request: Request) -> SeaweedStorage:
    return request.app.state.audio_storage


def _response(
    message: AudioMessage, *, idempotent_replay: bool = False
) -> AudioMessageResponse:
    payload = AudioMessageResponse.model_validate(message)
    if message.size_bytes is not None and message.object_key is not None:
        payload.content_url = f"/api/v1/audio-messages/{message.id}/content"
    payload.idempotent_replay = idempotent_replay
    return payload


def _segment_response(segment: TtsSegment) -> TtsSegmentResponse:
    payload = TtsSegmentResponse.model_validate(segment)
    if segment.status == "COMPLETED" and segment.size_bytes is not None:
        payload.content_url = f"/api/v1/tts-segments/{segment.id}/content"
    return payload


def _assert_header_identity(request: Request, user_id: uuid.UUID) -> None:
    principal = getattr(request.state, "principal", None)
    if request.app.state.auth_settings.enabled and (
        principal is None or principal.user_id != user_id
    ):
        raise HTTPException(status_code=403, detail="X-User-Id does not match token")


@router.post(
    "/workspaces/{workspace_id}/cards/{card_id}/audio-messages",
    response_model=AudioMessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_audio_message(
    workspace_id: uuid.UUID,
    card_id: uuid.UUID,
    request: Request,
    audio: UploadFile = File(...),
    client_sent_at: datetime | None = Form(default=None),
    direction: AudioMessageDirection = Form(
        default=AudioMessageDirection.INBOUND
    ),
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    idempotency_key: str = Header(
        alias="Idempotency-Key", min_length=1, max_length=128
    ),
    session: AsyncSession = Depends(get_write_session),
) -> AudioMessageResponse:
    _assert_header_identity(request, user_id)
    service = _service(request)
    storage = _storage(request)
    normalized_key = idempotency_key.strip()
    if not normalized_key:
        raise HTTPException(status_code=422, detail="Idempotency-Key is blank")
    content_type = (audio.content_type or "").split(";", 1)[0].lower()
    suffix = SUPPORTED_AUDIO_TYPES.get(content_type)
    if suffix is None:
        raise HTTPException(status_code=415, detail="Unsupported audio content type")

    try:
        async with session.begin():
            workspace, training_session, _ = await service.validate_context(
                session,
                workspace_id=workspace_id,
                card_id=card_id,
                user_id=user_id,
                require_active=False,
            )
            replay = await service.find_replay(
                session,
                training_session_id=training_session.id,
                idempotency_key=normalized_key,
            )
            if replay is not None:
                service.assert_replay_matches(
                    replay,
                    kind="STT",
                    card_id=card_id,
                    user_id=user_id,
                    direction=direction.value,
                )
                return _response(replay, idempotent_replay=True)
            service.assert_context_active(
                workspace,
                training_session,
            )
    except DomainError as exc:
        raise_http_error(exc)

    message_id = uuid.uuid4()
    received_at = datetime.now(timezone.utc)
    object_key = (
        f"{request.app.state.settings.seaweed_audio_prefix.rstrip('/')}"
        f"/{training_session.id}/{message_id}{suffix}"
    )
    try:
        stored = await storage.upload_file(
            object_key,
            audio,
            content_type=content_type,
            metadata={
                "Audio-Message-Id": str(message_id),
                "Training-Session-Id": str(training_session.id),
                "Workspace-Id": str(workspace_id),
                "Incident-Card-Id": str(card_id),
                "Actor-User-Id": str(user_id),
                "Kind": "STT",
                "Direction": direction.value,
                "Received-At": received_at.isoformat(),
                **(
                    {"Client-Sent-At": client_sent_at.isoformat()}
                    if client_sent_at
                    else {}
                ),
            },
        )
    except AudioTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except InvalidAudioError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AudioStorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        async with session.begin():
            message, replayed = await service.create_stt_message(
                session,
                message_id=message_id,
                workspace_id=workspace_id,
                card_id=card_id,
                user_id=user_id,
                idempotency_key=normalized_key,
                stored=stored,
                client_sent_at=client_sent_at,
                direction=direction.value,
            )
    except DomainError as exc:
        await storage.delete(object_key)
        raise_http_error(exc)
    except Exception as exc:
        committed = await _find_committed_message(request, message_id)
        if committed is not None:
            return _response(committed)
        # The outcome of COMMIT may still be ambiguous. Keep the object and let
        # the primary-backed reconciler delete it after the grace period.
        raise HTTPException(
            status_code=503,
            detail="Audio metadata could not be committed",
        ) from exc

    if replayed:
        await storage.delete(object_key)
    return _response(message, idempotent_replay=replayed)


async def _upload_call_audio_message(
    workspace_id: uuid.UUID,
    call_id: uuid.UUID,
    request: Request,
    audio: UploadFile,
    client_sent_at: datetime | None,
    user_id: uuid.UUID,
    idempotency_key: str,
    session: AsyncSession,
    *,
    call_direction: str,
) -> AudioMessageResponse:
    """Accept the trainee's speech during an active training call."""

    _assert_header_identity(request, user_id)

    service = _service(request)
    storage = _storage(request)
    normalized_key = idempotency_key.strip()
    if not normalized_key:
        raise HTTPException(status_code=422, detail="Idempotency-Key is blank")
    content_type = (audio.content_type or "").split(";", 1)[0].lower()
    suffix = SUPPORTED_AUDIO_TYPES.get(content_type)
    if suffix is None:
        raise HTTPException(status_code=415, detail="Unsupported audio content type")

    try:
        async with session.begin():
            workspace, training_session, training_call = await service.validate_call_context(
                session,
                workspace_id=workspace_id,
                call_id=call_id,
                user_id=user_id,
                require_active=False,
                require_active_call=False,
                call_direction=call_direction,
            )
            replay = await service.find_replay(
                session,
                training_session_id=training_session.id,
                idempotency_key=normalized_key,
            )
            if replay is not None:
                service.assert_replay_matches(
                    replay,
                    kind="STT",
                    training_call_id=call_id,
                    user_id=user_id,
                    direction=AudioMessageDirection.OUTBOUND.value,
                )
                return _response(replay, idempotent_replay=True)
            await service.validate_call_context(
                session,
                workspace_id=workspace_id,
                call_id=call_id,
                user_id=user_id,
                call_direction=call_direction,
                require_active=False,
            )
            service.assert_context_active(workspace, training_session)
    except DomainError as exc:
        raise_http_error(exc)

    message_id = uuid.uuid4()
    received_at = datetime.now(timezone.utc)
    object_key = (
        f"{request.app.state.settings.seaweed_audio_prefix.rstrip('/')}"
        f"/{training_session.id}/{message_id}{suffix}"
    )
    try:
        stored = await storage.upload_file(
            object_key,
            audio,
            content_type=content_type,
            metadata={
                "Audio-Message-Id": str(message_id),
                "Training-Session-Id": str(training_session.id),
                "Workspace-Id": str(workspace_id),
                "Training-Call-Id": str(call_id),
                "Incident-Card-Id": str(training_call.incident_card_id or ""),
                "Actor-User-Id": str(user_id),
                "Kind": "STT",
                "Direction": AudioMessageDirection.OUTBOUND.value,
                "Received-At": received_at.isoformat(),
                **(
                    {"Client-Sent-At": client_sent_at.isoformat()}
                    if client_sent_at
                    else {}
                ),
            },
        )
    except AudioTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    except InvalidAudioError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AudioStorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        async with session.begin():
            message, replayed = await service.create_call_stt_message(
                session,
                message_id=message_id,
                workspace_id=workspace_id,
                call_id=call_id,
                user_id=user_id,
                idempotency_key=normalized_key,
                stored=stored,
                client_sent_at=client_sent_at,
                call_direction=call_direction,
            )
    except DomainError as exc:
        await storage.delete(object_key)
        raise_http_error(exc)
    except Exception as exc:
        committed = await _find_committed_message(request, message_id)
        if committed is not None:
            return _response(committed)
        raise HTTPException(
            status_code=503,
            detail="Audio metadata could not be committed",
        ) from exc

    if replayed:
        await storage.delete(object_key)
    return _response(message, idempotent_replay=replayed)


@router.post(
    "/workspaces/{workspace_id}/incoming-calls/{call_id}/audio-messages",
    response_model=AudioMessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_incoming_call_audio_message(
    workspace_id: uuid.UUID,
    call_id: uuid.UUID,
    request: Request,
    audio: UploadFile = File(...),
    client_sent_at: datetime | None = Form(default=None),
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=128),
    session: AsyncSession = Depends(get_write_session),
) -> AudioMessageResponse:
    return await _upload_call_audio_message(
        workspace_id, call_id, request, audio, client_sent_at, user_id,
        idempotency_key, session, call_direction="INBOUND",
    )


@router.post(
    "/workspaces/{workspace_id}/outgoing-calls/{call_id}/audio-messages",
    response_model=AudioMessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_outgoing_call_audio_message(
    workspace_id: uuid.UUID,
    call_id: uuid.UUID,
    request: Request,
    audio: UploadFile = File(...),
    client_sent_at: datetime | None = Form(default=None),
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    idempotency_key: str = Header(alias="Idempotency-Key", min_length=1, max_length=128),
    session: AsyncSession = Depends(get_write_session),
) -> AudioMessageResponse:
    return await _upload_call_audio_message(
        workspace_id, call_id, request, audio, client_sent_at, user_id,
        idempotency_key, session, call_direction="OUTBOUND",
    )


@router.get(
    "/workspaces/{workspace_id}/cards/{card_id}/audio-messages",
    response_model=list[AudioMessageResponse],
)
async def list_audio_messages(
    workspace_id: uuid.UUID,
    card_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
) -> list[AudioMessageResponse]:
    _assert_header_identity(request, user_id)
    service = _service(request)
    try:
        async with session.begin():
            messages = await service.list_card_messages(
                session,
                workspace_id=workspace_id,
                card_id=card_id,
                user_id=user_id,
            )
    except DomainError as exc:
        raise_http_error(exc)
    return [_response(message) for message in messages]


@router.get(
    "/workspaces/{workspace_id}/incoming-calls/{call_id}/audio-messages",
    response_model=list[AudioMessageResponse],
)
async def list_incoming_call_audio_messages(
    workspace_id: uuid.UUID,
    call_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
) -> list[AudioMessageResponse]:
    _assert_header_identity(request, user_id)
    service = _service(request)
    try:
        async with session.begin():
            messages = await service.list_call_messages(
                session,
                workspace_id=workspace_id,
                call_id=call_id,
                user_id=user_id,
            )
    except DomainError as exc:
        raise_http_error(exc)
    return [_response(message) for message in messages]


@router.get(
    "/workspaces/{workspace_id}/outgoing-calls/{call_id}/audio-messages",
    response_model=list[AudioMessageResponse],
)
async def list_outgoing_call_audio_messages(
    workspace_id: uuid.UUID,
    call_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
) -> list[AudioMessageResponse]:
    _assert_header_identity(request, user_id)
    service = _service(request)
    try:
        async with session.begin():
            messages = await service.list_call_messages(
                session,
                workspace_id=workspace_id,
                call_id=call_id,
                user_id=user_id,
                call_direction="OUTBOUND",
            )
    except DomainError as exc:
        raise_http_error(exc)
    return [_response(message) for message in messages]


@router.get(
    "/audio-messages/{message_id}",
    response_model=AudioMessageResponse,
)
async def get_audio_message(
    message_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
) -> AudioMessageResponse:
    _assert_header_identity(request, user_id)
    service = _service(request)
    try:
        async with session.begin():
            message = await service.assert_message_access(
                session, message_id, user_id
            )
    except DomainError as exc:
        raise_http_error(exc)
    return _response(message)


@router.get("/audio-messages/{message_id}/content")
async def get_audio_message_content(
    message_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
) -> Response:
    _assert_header_identity(request, user_id)
    service = _service(request)
    try:
        async with session.begin():
            message = await service.assert_message_access(
                session, message_id, user_id
            )
            if message.size_bytes is None or message.object_key is None:
                raise HTTPException(status_code=409, detail="Audio is not ready")
            object_key = message.object_key
            etag = message.object_etag
    except DomainError as exc:
        raise_http_error(exc)

    try:
        content, content_type = await _storage(request).get_bytes(object_key)
    except AudioStorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    headers = {"Cache-Control": "private, no-store"}
    if etag:
        headers["ETag"] = f'"{etag}"'
    return Response(content=content, media_type=content_type, headers=headers)


@router.get("/audio-messages/{message_id}/tts-segments", response_model=list[TtsSegmentResponse])
async def list_tts_segments(
    message_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
) -> list[TtsSegmentResponse]:
    _assert_header_identity(request, user_id)
    try:
        async with session.begin():
            await _service(request).assert_message_access(session, message_id, user_id)
            segments = list(await session.scalars(select(TtsSegment).where(
                TtsSegment.audio_message_id == message_id,
            ).order_by(TtsSegment.segment_no)))
    except DomainError as exc:
        raise_http_error(exc)
    return [_segment_response(segment) for segment in segments]


@router.get("/tts-segments/{segment_id}/content")
async def get_tts_segment_content(
    segment_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
) -> Response:
    _assert_header_identity(request, user_id)
    try:
        async with session.begin():
            segment = await session.get(TtsSegment, segment_id)
            if segment is None:
                raise HTTPException(status_code=404, detail="TTS segment not found")
            await _service(request).assert_message_access(session, segment.audio_message_id, user_id)
            if segment.status != "COMPLETED" or segment.size_bytes is None:
                raise HTTPException(status_code=409, detail="TTS segment is not ready")
            object_key = segment.object_key
            expected_hash = segment.sha256
    except DomainError as exc:
        raise_http_error(exc)
    try:
        content, content_type = await _storage(request).get_bytes(object_key)
    except AudioStorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if expected_hash:
        import hashlib
        if hashlib.sha256(content).hexdigest() != expected_hash:
            raise HTTPException(status_code=503, detail="TTS segment checksum mismatch")
    return Response(content=content, media_type=content_type, headers={"Cache-Control": "private, no-store"})


async def _find_committed_message(
    request: Request,
    message_id: uuid.UUID,
) -> AudioMessage | None:
    """Resolve an ambiguous commit without risking deletion of live audio."""

    try:
        async with request.app.state.database.write_session_factory() as session:
            return await session.get(AudioMessage, message_id)
    except Exception:
        # Keep the object when PostgreSQL is unavailable. The reconciler can
        # remove it after the grace period if the transaction did not commit.
        return None
