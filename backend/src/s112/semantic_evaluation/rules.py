from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


OUTBOUND_CALL_RULE_KEY = "outbound_call"
EVALUATION_REQUESTED_ACTION = "OUTBOUND_CALL_EVALUATION_REQUESTED"
EVALUATION_RESULT_ACTION = "OUTBOUND_CALL_EVALUATED"


class OutboundCallRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_text: str = Field(min_length=1, max_length=10_000)
    minimum_similarity: float = Field(default=0.8, ge=0.0, le=1.0)

    @field_validator("expected_text")
    @classmethod
    def normalize_expected_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("expected_text must not be blank")
        return normalized


def outbound_call_rule(expected_result: dict[str, object] | None) -> OutboundCallRule | None:
    if expected_result and expected_result.get("outbound_call") is not None:
        raw = expected_result["outbound_call"]
        if not isinstance(raw, dict):
            raise ValueError("expected_result.outbound_call must be an object")
        return OutboundCallRule.model_validate(raw)

    return None
