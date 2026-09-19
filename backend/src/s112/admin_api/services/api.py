from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from s112.admin_api.clients import UpstreamError
from s112.admin_api.dependencies import get_admin_write_session
from s112.admin_api.safety import DISABLED_MESSAGE, reject_unsafe_operation


router = APIRouter(prefix="/services", tags=["services"])


class ServiceItem(BaseModel):
    name: str
    instance: str
    status: Literal["running", "unavailable", "unknown"]
    last_checked_at: datetime | None = None
    error: str | None = None
    actions_enabled: bool = False
    disabled_reason: str = DISABLED_MESSAGE


class ServiceAction(BaseModel):
    action: Literal["start", "stop", "restart"]


@router.get("", response_model=list[ServiceItem])
async def list_services(request: Request) -> list[ServiceItem]:
    try:
        payload = await request.app.state.observability.prometheus_targets()
    except UpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    output: list[ServiceItem] = []
    for target in payload.get("data", {}).get("activeTargets", []):
        labels = target.get("labels", {})
        health = str(target.get("health", "unknown"))
        last_scrape = target.get("lastScrape") or None
        try:
            checked_at = datetime.fromisoformat(last_scrape.replace("Z", "+00:00")) if last_scrape else None
        except (TypeError, ValueError):
            checked_at = None
        output.append(
            ServiceItem(
                name=str(labels.get("job", "unknown")),
                instance=str(labels.get("instance", "unknown")),
                status=(
                    "running" if health == "up" else "unavailable" if health == "down" else "unknown"
                ),
                last_checked_at=checked_at,
                error=target.get("lastError") or None,
            )
        )
    return sorted(output, key=lambda item: (item.name, item.instance))


@router.post("/{service_name}/actions", status_code=423)
async def service_action(
    service_name: str,
    payload: ServiceAction,
    request: Request,
    session: AsyncSession = Depends(get_admin_write_session),
) -> None:
    if not service_name or len(service_name) > 100:
        raise HTTPException(status_code=422, detail="Invalid service name")
    await reject_unsafe_operation(
        session,
        request,
        action=f"SERVICE_{payload.action.upper()}",
        target_type="service",
        target_id=service_name,
    )
