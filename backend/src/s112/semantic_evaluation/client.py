from __future__ import annotations

import json
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field, field_validator

from s112.common.config import Settings


class SemanticEvaluationError(RuntimeError):
    pass


class SemanticEvaluationResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    similarity: float = Field(ge=0.0, le=1.0)
    missing_facts: list[str] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)
    explanation: str = Field(default="", max_length=4_000)

    @field_validator("missing_facts", "contradictions")
    @classmethod
    def normalize_items(cls, value: list[str]) -> list[str]:
        return [item.strip() for item in value if item.strip()][:100]


class SemanticEvaluationClient:
    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.settings = settings
        self._client = client or httpx.AsyncClient(
            base_url=settings.semantic_evaluation_api_url.rstrip("/"),
            timeout=httpx.Timeout(
                settings.semantic_evaluation_timeout_seconds,
                connect=10.0,
            ),
        )
        self._owns_client = client is None

    async def evaluate(
        self,
        *,
        expected_text: str,
        actual_text: str,
    ) -> SemanticEvaluationResult:
        system_prompt = (
            "Ты проверяешь сообщение оператора экстренной службы. "
            "Сравни смысл фактического сообщения с ожидаемым. Учитывай передачу "
            "ключевых фактов, адресов, вида происшествия, пострадавших и требуемых "
            "действий. Не штрафуй за перефразирование, порядок слов и мелкие ошибки "
            "распознавания речи. Существенно снижай оценку за пропущенные или "
            "противоречащие факты. Верни только JSON с полями similarity (0..1), "
            "missing_facts (массив строк), contradictions (массив строк), "
            "explanation (короткая строка)."
        )
        user_prompt = (
            "Ожидаемое сообщение:\n"
            f"{expected_text}\n\n"
            "Фактическая расшифровка:\n"
            f"{actual_text}"
        )
        try:
            response = await self._client.post(
                "/v1/chat/completions",
                json={
                    "model": self.settings.semantic_evaluation_model,
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            response.raise_for_status()
            payload = response.json()
            content = payload["choices"][0]["message"]["content"]
            if not isinstance(content, str) or not content.strip():
                raise ValueError("empty completion content")
            parsed = _parse_json_object(content)
            return SemanticEvaluationResult.model_validate(parsed)
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
            raise SemanticEvaluationError(
                f"Semantic evaluation request failed: {exc}"
            ) from exc

    async def close(self) -> None:
        if self._owns_client:
            await self._client.aclose()


def _parse_json_object(content: str) -> dict[str, Any]:
    normalized = content.strip()
    if normalized.startswith("```"):
        lines = normalized.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        normalized = "\n".join(lines).strip()
    try:
        value = json.loads(normalized)
    except json.JSONDecodeError:
        start = normalized.find("{")
        end = normalized.rfind("}")
        if start < 0 or end <= start:
            raise
        value = json.loads(normalized[start : end + 1])
    if not isinstance(value, dict):
        raise ValueError("LLM response must be a JSON object")
    return value
