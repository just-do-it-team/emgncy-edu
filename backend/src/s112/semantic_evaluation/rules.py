from __future__ import annotations

from typing import Any

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


def outbound_call_rule(
    evaluation_rules: dict[str, Any] | None,
    expected_result: dict[str, Any] | None = None,
) -> OutboundCallRule | None:
    if expected_result and expected_result.get("outbound_call") is not None:
        raw = expected_result["outbound_call"]
        if not isinstance(raw, dict):
            raise ValueError("expected_result.outbound_call must be an object")
        return OutboundCallRule.model_validate(raw)

    if evaluation_rules and OUTBOUND_CALL_RULE_KEY in evaluation_rules:
        raw = evaluation_rules[OUTBOUND_CALL_RULE_KEY]
        if not isinstance(raw, dict):
            raise ValueError("evaluation_rules.outbound_call must be an object")
        return OutboundCallRule.model_validate(raw)

    return None


def validate_evaluation_rules(value: dict[str, Any]) -> dict[str, Any]:
    if "call_evaluation" in value:
        raise ValueError("Use expected_result.outbound_call instead of call_evaluation")
    outbound_call_rule(value)
    return value
