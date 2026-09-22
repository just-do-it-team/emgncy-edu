from __future__ import annotations

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

    async def transcribe(self, path: Path, content_type: str) -> str:
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
            return text.strip()
        except httpx.HTTPStatusError as exc:
            details = exc.response.text.strip()
            if len(details) > 2000:
                details = f"{details[:2000]}..."
            raise SpeechModelAPIError(
                f"STT request failed with HTTP {exc.response.status_code}: {details}"
            ) from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise SpeechModelAPIError(f"STT request failed: {exc}") from exc

    async def synthesize(self, text: str) -> tuple[bytes, int]:
        try:
            response = await self._client.post(
                "/api/v1/tts",
                json={"text": text},
            )
            response.raise_for_status()
            sample_rate = int(response.headers["X-Sample-Rate"])
            if not response.content:
                raise SpeechModelAPIError("Speech API returned empty audio")
            return response.content, sample_rate
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise SpeechModelAPIError(f"TTS request failed: {exc}") from exc
