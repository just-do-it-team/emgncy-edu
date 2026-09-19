from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from s112.admin_api.dependencies import get_admin_write_session
from s112.admin_api.safety import DISABLED_MESSAGE, reject_unsafe_operation


router = APIRouter(prefix="/backups", tags=["backups"])


class BackupStatus(BaseModel):
    configured: bool = False
    safe_mode: bool = True
    schedule: str | None = None
    destination: str | None = None
    last_successful_at: datetime | None = None
    actions_enabled: bool = False
    disabled_reason: str = DISABLED_MESSAGE


class BackupItem(BaseModel):
    id: str
    created_at: datetime
    size_bytes: int
    status: Literal["completed", "failed"]


class BackupAction(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


@router.get("/status", response_model=BackupStatus)
async def backup_status() -> BackupStatus:
    return BackupStatus()


@router.get("", response_model=list[BackupItem])
async def list_backups() -> list[BackupItem]:
    return []


@router.post("/actions/create", status_code=423)
async def create_backup(
    payload: BackupAction,
    request: Request,
    session: AsyncSession = Depends(get_admin_write_session),
) -> None:
    await reject_unsafe_operation(
        session,
        request,
        action="BACKUP_CREATE",
        target_type="backup",
        details={"reason": payload.reason},
    )


@router.post("/{backup_id}/actions/restore", status_code=423)
async def restore_backup(
    backup_id: str,
    payload: BackupAction,
    request: Request,
    session: AsyncSession = Depends(get_admin_write_session),
) -> None:
    await reject_unsafe_operation(
        session,
        request,
        action="BACKUP_RESTORE",
        target_type="backup",
        target_id=backup_id[:128],
        details={"reason": payload.reason},
    )
