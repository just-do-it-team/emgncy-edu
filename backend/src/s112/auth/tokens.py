from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from s112.auth.settings import AuthSettings
from s112.common.enums import UserRole


JWT_ALGORITHM = "HS256"
JWT_TYPE = "JWT"
MAX_TOKEN_LENGTH = 16_384


class TokenError(ValueError):
    """Raised when an access token cannot be trusted."""


def _encode_segment(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _decode_segment(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    try:
        return base64.b64decode(
            value + padding,
            altchars=b"-_",
            validate=True,
        )
    except (ValueError, binascii.Error) as exc:
        raise TokenError("Malformed JWT encoding") from exc


def _json_segment(value: dict[str, Any]) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return _encode_segment(payload)


def _integer_claim(claims: dict[str, Any], name: str) -> int:
    value = claims.get(name)
    if isinstance(value, bool) or not isinstance(value, int):
        raise TokenError(f"JWT claim {name!r} must be an integer")
    return value


def create_access_token(
    *,
    user_id: uuid.UUID,
    username: str,
    role: UserRole,
    settings: AuthSettings,
    now: datetime | None = None,
) -> tuple[str, datetime]:
    issued_at = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    expires_at = issued_at + timedelta(seconds=settings.access_token_ttl_seconds)
    header = {"alg": JWT_ALGORITHM, "typ": JWT_TYPE}
    claims = {
        "sub": str(user_id),
        "username": username,
        "role": role.value,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(issued_at.timestamp()),
        "nbf": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": str(uuid.uuid4()),
    }
    signing_input = f"{_json_segment(header)}.{_json_segment(claims)}"
    signature = hmac.new(
        settings.signing_secret(),
        signing_input.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{signing_input}.{_encode_segment(signature)}", expires_at


def decode_access_token(
    token: str,
    *,
    settings: AuthSettings,
    now: datetime | None = None,
) -> dict[str, Any]:
    if not token or len(token) > MAX_TOKEN_LENGTH:
        raise TokenError("Invalid JWT length")
    try:
        encoded_header, encoded_claims, encoded_signature = token.split(".")
    except ValueError as exc:
        raise TokenError("JWT must contain three segments") from exc

    try:
        header = json.loads(_decode_segment(encoded_header))
        claims = json.loads(_decode_segment(encoded_claims))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise TokenError("Malformed JWT JSON") from exc
    if not isinstance(header, dict) or not isinstance(claims, dict):
        raise TokenError("Malformed JWT document")
    if header.get("alg") != JWT_ALGORITHM or header.get("typ") != JWT_TYPE:
        raise TokenError("Unsupported JWT header")

    signing_input = f"{encoded_header}.{encoded_claims}".encode("ascii")
    expected_signature = hmac.new(
        settings.signing_secret(),
        signing_input,
        hashlib.sha256,
    ).digest()
    actual_signature = _decode_segment(encoded_signature)
    if not hmac.compare_digest(actual_signature, expected_signature):
        raise TokenError("Invalid JWT signature")

    if claims.get("iss") != settings.jwt_issuer:
        raise TokenError("Invalid JWT issuer")
    audience = claims.get("aud")
    if not (
        audience == settings.jwt_audience
        or isinstance(audience, list)
        and settings.jwt_audience in audience
    ):
        raise TokenError("Invalid JWT audience")

    current_timestamp = int((now or datetime.now(timezone.utc)).timestamp())
    skew = settings.clock_skew_seconds
    expires_at = _integer_claim(claims, "exp")
    not_before = _integer_claim(claims, "nbf")
    issued_at = _integer_claim(claims, "iat")
    if current_timestamp - skew >= expires_at:
        raise TokenError("JWT has expired")
    if current_timestamp + skew < not_before:
        raise TokenError("JWT is not active yet")
    if current_timestamp + skew < issued_at:
        raise TokenError("JWT was issued in the future")

    subject = claims.get("sub")
    token_id = claims.get("jti")
    if not isinstance(subject, str) or not isinstance(token_id, str):
        raise TokenError("JWT identity claims are missing")
    try:
        uuid.UUID(subject)
        uuid.UUID(token_id)
        UserRole(claims.get("role"))
    except (ValueError, TypeError) as exc:
        raise TokenError("JWT identity claims are invalid") from exc
    if not isinstance(claims.get("username"), str):
        raise TokenError("JWT username claim is invalid")
    return claims
