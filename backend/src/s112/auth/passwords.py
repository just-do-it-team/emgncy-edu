from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import secrets


PBKDF2_ALGORITHM = "pbkdf2_sha256"
PBKDF2_ITERATIONS = 600_000
SALT_BYTES = 16


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii")


def _decode(value: str) -> bytes:
    return base64.b64decode(value, altchars=b"-_", validate=True)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return "$".join(
        (
            PBKDF2_ALGORITHM,
            str(PBKDF2_ITERATIONS),
            _encode(salt),
            _encode(digest),
        )
    )


def verify_password(password: str, encoded_password: str) -> bool:
    try:
        algorithm, raw_iterations, raw_salt, raw_digest = encoded_password.split("$")
        iterations = int(raw_iterations)
        salt = _decode(raw_salt)
        expected_digest = _decode(raw_digest)
    except (ValueError, TypeError, binascii.Error):
        return False

    if algorithm != PBKDF2_ALGORITHM or not 1 <= iterations <= 10_000_000:
        return False
    if not salt or not expected_digest:
        return False

    actual_digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
        dklen=len(expected_digest),
    )
    return hmac.compare_digest(actual_digest, expected_digest)
