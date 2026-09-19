from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from s112.admin_api.dependencies import get_admin_write_session
from s112.admin_api.safety import DISABLED_MESSAGE, reject_unsafe_operation


router = APIRouter(prefix="/updates", tags=["updates"])


class UpdateStatus(BaseModel):
    state: Literal["disabled"] = "disabled"
    last_checked_at: datetime | None = None
    available_count: int | None = None
    actions_enabled: bool = False
    disabled_reason: str = DISABLED_MESSAGE


class PackageUpdate(BaseModel):
    name: str
    installed_version: str
    available_version: str
    security_update: bool = False


class UpdateAction(BaseModel):
    packages: list[str] = Field(default_factory=list, max_length=200)


@router.get("/status", response_model=UpdateStatus)
async def update_status() -> UpdateStatus:
    return UpdateStatus()


@router.get("/packages", response_model=list[PackageUpdate])
async def available_packages() -> list[PackageUpdate]:
    return []


@router.post("/actions/check", status_code=423)
async def check_updates(
    request: Request,
    session: AsyncSession = Depends(get_admin_write_session),
) -> None:
    await reject_unsafe_operation(
        session,
        request,
        action="UPDATE_CHECK",
        target_type="software_updates",
    )


@router.post("/actions/apply", status_code=423)
async def apply_updates(
    payload: UpdateAction,
    request: Request,
    session: AsyncSession = Depends(get_admin_write_session),
) -> None:
    await reject_unsafe_operation(
        session,
        request,
        action="UPDATE_APPLY",
        target_type="software_updates",
        details={"packages": payload.packages},
    )
