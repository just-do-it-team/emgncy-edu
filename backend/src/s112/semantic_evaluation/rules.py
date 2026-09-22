from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


OUTBOUND_CALL_RULE_KEY = "outbound_call"
LEGACY_CALL_RULE_KEY = "call_evaluation"
LEGACY_CALL_ACTION = "RESPONSE_TEAM_LEADER_CALLED"
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

    if not evaluation_rules or LEGACY_CALL_RULE_KEY not in evaluation_rules:
        return None
    legacy_rule = evaluation_rules[LEGACY_CALL_RULE_KEY]
    if not isinstance(legacy_rule, dict):
        raise ValueError("evaluation_rules.call_evaluation must be an object")
    if expected_result is None:
        # Schema validation receives evaluation_rules without expected_result.
        # Validate the resolved legacy pair when a session card is processed.
        return None

    for required in expected_result.get("required_actions", []):
        if required.get("action_type") != LEGACY_CALL_ACTION:
            continue
        parameters = required.get("parameters") or {}
        transcript = parameters.get("expected_transcript") or {}
        if not isinstance(transcript, dict):
            break
        comparison_field = legacy_rule.get("comparison_field", "required_facts")
        expected_text = transcript.get(comparison_field)
        if not isinstance(expected_text, str) or not expected_text.strip():
            expected_text = transcript.get("required_facts") or transcript.get(
                "reference_text"
            )
        if isinstance(expected_text, str) and expected_text.strip():
            return OutboundCallRule(
                expected_text=expected_text,
                minimum_similarity=legacy_rule.get("minimum_similarity", 0.8),
            )
        break
    raise ValueError(
        "evaluation_rules.call_evaluation requires "
        "RESPONSE_TEAM_LEADER_CALLED.parameters.expected_transcript"
    )


def validate_evaluation_rules(value: dict[str, Any]) -> dict[str, Any]:
    outbound_call_rule(value)
    return value
