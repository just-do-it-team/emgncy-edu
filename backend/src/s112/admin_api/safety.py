from __future__ import annotations

from fastapi import HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from s112.admin_api.audit import add_audit_event


DISABLED_MESSAGE = (
    "Операция недоступна в демонстрационном стенде в целях безопасности."
)


async def reject_unsafe_operation(
    session: AsyncSession,
    request: Request,
    *,
    action: str,
    target_type: str,
    target_id: str | None = None,
    details: dict[str, object] | None = None,
) -> None:
    async with session.begin():
        add_audit_event(
            session,
            request,
            action=action,
            target_type=target_type,
            target_id=target_id,
            result="DENIED",
            details={"reason": "demo_safety_mode", **(details or {})},
        )
    raise HTTPException(
        status_code=status.HTTP_423_LOCKED,
        detail={"code": "operation_disabled", "message": DISABLED_MESSAGE},
    )
