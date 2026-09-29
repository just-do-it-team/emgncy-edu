"""Resolve the caller identity for development and JWT modes."""

import uuid
from typing import TypeVar

from fastapi import Header, HTTPException, Request
from pydantic import BaseModel


Payload = TypeVar("Payload", bound=BaseModel)


def acting_user_id(request: Request, supplied_id: uuid.UUID | None) -> uuid.UUID:
    if request.app.state.auth_settings.enabled:
        principal = getattr(request.state, "principal", None)
        if principal is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        return principal.user_id
    if supplied_id is None:
        raise HTTPException(status_code=422, detail="User ID is required")
    return supplied_id


def header_user_id(
    request: Request,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> uuid.UUID:
    if request.app.state.auth_settings.enabled:
        return acting_user_id(request, None)
    if x_user_id is None:
        raise HTTPException(status_code=422, detail="X-User-Id is required")
    try:
        return uuid.UUID(x_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid X-User-Id") from exc


def with_acting_user(request: Request, payload: Payload, field: str) -> Payload:
    return payload.model_copy(
        update={field: acting_user_id(request, getattr(payload, field))}
    )


def with_optional_acting_user(request: Request, payload: Payload, field: str) -> Payload:
    if not request.app.state.auth_settings.enabled:
        return payload
    return with_acting_user(request, payload, field)
