from __future__ import annotations

import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from s112.domain.models import AuditEvent


def actor_id_from_request(request: Request) -> uuid.UUID | None:
    if request.app.state.auth_settings.enabled:
        return request.state.principal.user_id
    raw_value = request.headers.get("X-Admin-Actor-Id")
    if not raw_value:
        return None
    try:
        return uuid.UUID(raw_value)
    except ValueError:
        return None


def add_audit_event(
    session: AsyncSession,
    request: Request,
    *,
    action: str,
    target_type: str,
    target_id: str | None = None,
    result: str = "SUCCESS",
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        actor_id=actor_id_from_request(request),
        actor_username=(
            request.state.principal.username[:64]
            if request.app.state.auth_settings.enabled
            else (request.headers.get("X-Admin-Actor-Username") or "")[:64] or None
        ),
        action=action,
        target_type=target_type,
        target_id=target_id,
        result=result,
        details=details or {},
        ip_address=request.client.host if request.client else None,
        user_agent=(request.headers.get("User-Agent") or "")[:512] or None,
        request_id=(request.headers.get("X-Request-Id") or "")[:128] or None,
    )
    session.add(event)
    return event
