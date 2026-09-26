from __future__ import annotations

from contextlib import ExitStack
from pathlib import Path

import httpx

from s112.common.config import Settings


class SpeechModelAPIError(RuntimeError):
    pass


class SpeechModelClient:
    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.settings = settings
        self._client = client or httpx.AsyncClient(
            base_url=settings.speech_api_url.rstrip("/"),
            timeout=httpx.Timeout(
                settings.speech_api_timeout_seconds,
                connect=10.0,
            ),
        )
        self._owns_client = client is None

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def transcribe(self, path: Path, content_type: str) -> tuple[str, int | None]:
        try:
            with path.open("rb") as source:
                response = await self._client.post(
                    "/api/v1/stt",
                    files={"audio": (path.name, source, content_type)},
                )
            response.raise_for_status()
            payload = response.json()
            text = payload.get("text") if isinstance(payload, dict) else None
            if not isinstance(text, str) or not text.strip():
                raise SpeechModelAPIError("Speech API returned an empty transcript")
            duration_ms = payload.get("duration_ms")
            if isinstance(duration_ms, bool) or not isinstance(duration_ms, int) or duration_ms < 0:
                duration_ms = None
            return text.strip(), duration_ms
        except httpx.HTTPStatusError as exc:
            details = exc.response.text.strip()
            if len(details) > 2000:
                details = f"{details[:2000]}..."
            raise SpeechModelAPIError(
                f"STT request failed with HTTP {exc.response.status_code}: {details}"
            ) from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise SpeechModelAPIError(f"STT request failed: {exc}") from exc

    async def synthesize(self, text: str, voice_id: str | None = None) -> tuple[bytes, int]:
        try:
            payload = {"text": text}
            if voice_id is not None:
                payload["voice_id"] = voice_id
            response = await self._client.post(
                "/api/v1/tts",
                json=payload,
            )
            response.raise_for_status()
            sample_rate = int(response.headers["X-Sample-Rate"])
            if not response.content:
                raise SpeechModelAPIError("Speech API returned empty audio")
            return response.content, sample_rate
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise SpeechModelAPIError(f"TTS request failed: {exc}") from exc

    async def compose_call_recording(self, paths: list[Path]) -> tuple[bytes, int]:
        try:
            with ExitStack() as stack:
                files = [
                    ("audio", (path.name, stack.enter_context(path.open("rb")), "application/octet-stream"))
                    for path in paths
                ]
                response = await self._client.post(
                    "/api/v1/call-recordings/compose", files=files
                )
            response.raise_for_status()
            duration_ms = int(response.headers["X-Duration-Ms"])
            if not response.content or duration_ms <= 0:
                raise SpeechModelAPIError("Speech API returned an empty call recording")
            return response.content, duration_ms
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise SpeechModelAPIError(f"Call recording composition failed: {exc}") from exc
