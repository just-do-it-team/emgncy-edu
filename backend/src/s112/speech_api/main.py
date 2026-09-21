from __future__ import annotations

import asyncio
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field, field_validator

from s112.common.config import get_settings
from s112.speech_api.service import SpeechService, SpeechServiceError


settings = get_settings()
speech = SpeechService(settings)
model_gate = asyncio.Lock()


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)

    @field_validator("text")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("text must not be blank")
        return normalized


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        if settings.preload_models:
            await asyncio.to_thread(speech.preload)
        yield
    finally:
        await asyncio.to_thread(speech.close)


app = FastAPI(
    title="System-112 Speech Model API",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> JSONResponse:
    ready = not settings.preload_models or (
        speech.stt_loaded and speech.tts_loaded
    )
    return JSONResponse(
        status_code=200 if ready else 503,
        content={
            "status": "ok" if ready else "degraded",
            "stt_loaded": speech.stt_loaded,
            "tts_loaded": speech.tts_loaded,
        },
    )


@app.post("/api/v1/stt")
async def transcribe(audio: UploadFile = File(...)) -> dict[str, str]:
    path = await _save_upload(audio)
    try:
        async with model_gate:
            text = await asyncio.to_thread(speech.transcribe, str(path))
    except SpeechServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        path.unlink(missing_ok=True)
    return {"text": text}


@app.post("/api/v1/tts")
async def synthesize(request: TTSRequest) -> Response:
    if len(request.text) > settings.tts_max_text_chars:
        raise HTTPException(status_code=422, detail="Text is too long")
    try:
        async with model_gate:
            audio, sample_rate = await asyncio.to_thread(
                speech.synthesize, request.text
            )
    except SpeechServiceError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"X-Sample-Rate": str(sample_rate)},
    )


async def _save_upload(upload: UploadFile) -> Path:
    suffix = Path(upload.filename or "").suffix.lower() or ".audio"
    descriptor, filename = tempfile.mkstemp(prefix="s112-stt-", suffix=suffix)
    os.close(descriptor)
    path = Path(filename)
    total = 0
    try:
        with path.open("wb") as destination:
            while chunk := await upload.read(1024 * 1024):
                total += len(chunk)
                if total > settings.audio_max_upload_bytes:
                    raise HTTPException(status_code=413, detail="Audio is too large")
                destination.write(chunk)
        if total == 0:
            raise HTTPException(status_code=422, detail="Audio is empty")
        return path
    except Exception:
        path.unlink(missing_ok=True)
        raise
