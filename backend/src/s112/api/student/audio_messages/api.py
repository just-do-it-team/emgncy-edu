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
from s112.audio.schemas import AudioMessageResponse, TTSMessageCreate
from s112.audio.service import AudioMessageService
from s112.audio.storage import (
    AudioStorageError,
    AudioTooLargeError,
    InvalidAudioError,
    SeaweedStorage,
)
from s112.common.enums import AudioMessageDirection
from s112.domain.models import AudioMessage


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


def _service(request: Request) -> AudioMessageService:
    return AudioMessageService(request.app.state.settings)


def _storage(request: Request) -> SeaweedStorage:
    return request.app.state.audio_storage


def _response(
    message: AudioMessage, *, idempotent_replay: bool = False
) -> AudioMessageResponse:
    payload = AudioMessageResponse.model_validate(message)
    if message.size_bytes is not None:
        payload.content_url = f"/api/v1/audio-messages/{message.id}/content"
    payload.idempotent_replay = idempotent_replay
    return payload


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


@router.post(
    "/workspaces/{workspace_id}/cards/{card_id}/tts-messages",
    response_model=AudioMessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def create_tts_message(
    workspace_id: uuid.UUID,
    card_id: uuid.UUID,
    body: TTSMessageCreate,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    idempotency_key: str = Header(
        alias="Idempotency-Key", min_length=1, max_length=128
    ),
    session: AsyncSession = Depends(get_write_session),
) -> AudioMessageResponse:
    normalized_key = idempotency_key.strip()
    if not normalized_key:
        raise HTTPException(status_code=422, detail="Idempotency-Key is blank")
    service = _service(request)
    message_id = uuid.uuid4()
    try:
        async with session.begin():
            message, replayed = await service.create_tts_message(
                session,
                message_id=message_id,
                workspace_id=workspace_id,
                card_id=card_id,
                user_id=user_id,
                idempotency_key=normalized_key,
                text=body.text,
                client_sent_at=body.client_sent_at,
            )
    except DomainError as exc:
        raise_http_error(exc)
    except Exception as exc:
        committed = await _find_committed_message(request, message_id)
        if committed is not None:
            return _response(committed)
        raise HTTPException(
            status_code=503,
            detail="TTS request metadata could not be committed",
        ) from exc
    return _response(message, idempotent_replay=replayed)


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
    "/audio-messages/{message_id}",
    response_model=AudioMessageResponse,
)
async def get_audio_message(
    message_id: uuid.UUID,
    request: Request,
    user_id: uuid.UUID = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_write_session),
) -> AudioMessageResponse:
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
    service = _service(request)
    try:
        async with session.begin():
            message = await service.assert_message_access(
                session, message_id, user_id
            )
            if message.size_bytes is None:
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
