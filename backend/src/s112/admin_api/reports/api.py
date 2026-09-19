from __future__ import annotations

import asyncio
import csv
import io
import json
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from s112.admin_api.clients import UpstreamError, prometheus_results
from s112.admin_api.dependencies import get_admin_read_session
from s112.domain.models import AuditEvent, IncidentCard, UserAccount


router = APIRouter(prefix="/reports", tags=["reports"])


class ReportDefinition(BaseModel):
    key: str
    title: str
    description: str


class UsageReport(BaseModel):
    start: datetime
    end: datetime
    cards_created: int
    cards_by_status: dict[str, int]
    users_total: int
    users_blocked: int


class ErrorReport(BaseModel):
    start: datetime
    end: datetime
    total: int
    by_service: dict[str, int]


class MetricStatistics(BaseModel):
    key: str
    unit: str
    current: float | None = None
    average: float | None = None
    maximum: float | None = None


class LoadReport(BaseModel):
    start: datetime
    end: datetime
    metrics: list[MetricStatistics]
    warnings: list[str] = Field(default_factory=list)


class HealthTarget(BaseModel):
    job: str
    instance: str
    health: str
    optional: bool
    error: str | None = None


class HealthReport(BaseModel):
    generated_at: datetime
    status: str
    targets: list[HealthTarget]
    firing_alerts: int


class AuditItem(BaseModel):
    id: uuid.UUID
    occurred_at: datetime
    actor_id: uuid.UUID | None
    actor_username: str | None
    action: str
    target_type: str
    target_id: str | None
    result: str
    details: dict[str, Any]
    ip_address: str | None
    request_id: str | None


class AuditPage(BaseModel):
    items: list[AuditItem]
    total: int
    limit: int
    offset: int


REPORTS = [
    ReportDefinition(
        key="usage",
        title="Использование системы",
        description="Количество карточек, их статусы и состояние учётных записей.",
    ),
    ReportDefinition(
        key="errors",
        title="Ошибки и сбои",
        description="Ошибки компонентов по данным системных журналов.",
    ),
    ReportDefinition(
        key="server-load",
        title="Нагрузка на сервер",
        description="CPU, оперативная память, диск и сетевой трафик за период.",
    ),
    ReportDefinition(
        key="health",
        title="Работоспособность",
        description="Состояние целей и активные предупреждения Prometheus.",
    ),
    ReportDefinition(
        key="user-actions",
        title="Действия пользователей",
        description="Аудит административных операций и отклонённых попыток.",
    ),
]

LOAD_QUERIES = {
    "cpu_percent": (
        "percent",
        '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
    ),
    "memory_percent": (
        "percent",
        "100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
    ),
    "disk_percent": (
        "percent",
        'max(100 * (1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs"} '
        '/ node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs"}))',
    ),
    "network_bytes_per_second": (
        "bytes_per_second",
        'sum(rate(node_network_receive_bytes_total{device!="lo"}[5m])) + '
        'sum(rate(node_network_transmit_bytes_total{device!="lo"}[5m]))',
    ),
}


def _period(
    start: datetime | None,
    end: datetime | None,
    *,
    default: timedelta = timedelta(days=1),
    maximum: timedelta = timedelta(days=366),
) -> tuple[datetime, datetime]:
    actual_end = end or datetime.now(timezone.utc)
    actual_start = start or actual_end - default
    if actual_start.tzinfo is None or actual_end.tzinfo is None:
        raise HTTPException(status_code=422, detail="start and end must include a timezone")
    if actual_start >= actual_end:
        raise HTTPException(status_code=422, detail="start must be earlier than end")
    if actual_end - actual_start > maximum:
        raise HTTPException(status_code=422, detail="Report period is too large")
    return actual_start, actual_end


def _audit_item(event: AuditEvent) -> AuditItem:
    return AuditItem(
        id=event.id,
        occurred_at=event.occurred_at,
        actor_id=event.actor_id,
        actor_username=event.actor_username,
        action=event.action,
        target_type=event.target_type,
        target_id=event.target_id,
        result=event.result,
        details=event.details,
        ip_address=event.ip_address,
        request_id=event.request_id,
    )


def _audit_filters(
    *,
    start: datetime,
    end: datetime,
    actor_id: uuid.UUID | None,
    action: str | None,
    result: str | None,
) -> list[Any]:
    filters: list[Any] = [
        AuditEvent.occurred_at >= start,
        AuditEvent.occurred_at <= end,
    ]
    if actor_id is not None:
        filters.append(AuditEvent.actor_id == actor_id)
    if action:
        filters.append(AuditEvent.action == action.upper())
    if result:
        filters.append(AuditEvent.result == result.upper())
    return filters


@router.get("/catalog", response_model=list[ReportDefinition])
async def report_catalog() -> list[ReportDefinition]:
    return REPORTS


@router.get("/usage", response_model=UsageReport)
async def usage_report(
    start: datetime | None = None,
    end: datetime | None = None,
    session: AsyncSession = Depends(get_admin_read_session),
) -> UsageReport:
    actual_start, actual_end = _period(start, end)
    cards_created = await session.scalar(
        select(func.count())
        .select_from(IncidentCard)
        .where(
            IncidentCard.registered_at >= actual_start,
            IncidentCard.registered_at <= actual_end,
        )
    )
    status_rows = await session.execute(
        select(IncidentCard.current_status, func.count())
        .where(
            IncidentCard.registered_at >= actual_start,
            IncidentCard.registered_at <= actual_end,
        )
        .group_by(IncidentCard.current_status)
    )
    users_total = await session.scalar(select(func.count()).select_from(UserAccount))
    users_blocked = await session.scalar(
        select(func.count())
        .select_from(UserAccount)
        .where(UserAccount.is_blocked.is_(True))
    )
    return UsageReport(
        start=actual_start,
        end=actual_end,
        cards_created=int(cards_created or 0),
        cards_by_status={str(key): int(value) for key, value in status_rows.all()},
        users_total=int(users_total or 0),
        users_blocked=int(users_blocked or 0),
    )


@router.get("/errors", response_model=ErrorReport)
async def error_report(
    request: Request,
    start: datetime | None = None,
    end: datetime | None = None,
) -> ErrorReport:
    actual_start, actual_end = _period(
        start, end, maximum=timedelta(days=30)
    )
    seconds = max(1, int((actual_end - actual_start).total_seconds()))
    query = (
        'sum by (service) (count_over_time({service=~".+"} '
        f'|~ "(?i)(error|critical|exception|fatal|panic)" [{seconds}s]))'
    )
    try:
        payload = await request.app.state.observability.loki_query(
            query, actual_end.timestamp()
        )
    except UpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    by_service: dict[str, int] = {}
    for item in prometheus_results(payload):
        value = item.get("value", [])
        if not isinstance(value, list) or len(value) != 2:
            continue
        service = str(item.get("metric", {}).get("service", "unknown"))
        try:
            by_service[service] = int(float(value[1]))
        except (TypeError, ValueError):
            continue
    return ErrorReport(
        start=actual_start,
        end=actual_end,
        total=sum(by_service.values()),
        by_service=by_service,
    )


async def _load_metric_range(
    request: Request,
    key: str,
    unit: str,
    query: str,
    start: datetime,
    end: datetime,
    step: int,
) -> tuple[MetricStatistics, str | None]:
    try:
        payload = await request.app.state.observability.prometheus_query_range(
            query=query,
            start=start.timestamp(),
            end=end.timestamp(),
            step=step,
        )
    except UpstreamError as exc:
        return MetricStatistics(key=key, unit=unit), str(exc)
    values: list[float] = []
    for series in prometheus_results(payload):
        for _, raw_value in series.get("values", []):
            try:
                value = float(raw_value)
            except (TypeError, ValueError):
                continue
            if math.isfinite(value):
                values.append(value)
    if not values:
        return MetricStatistics(key=key, unit=unit), None
    return (
        MetricStatistics(
            key=key,
            unit=unit,
            current=values[-1],
            average=sum(values) / len(values),
            maximum=max(values),
        ),
        None,
    )


@router.get("/server-load", response_model=LoadReport)
async def server_load_report(
    request: Request,
    start: datetime | None = None,
    end: datetime | None = None,
) -> LoadReport:
    actual_start, actual_end = _period(
        start, end, default=timedelta(hours=1), maximum=timedelta(days=30)
    )
    seconds = int((actual_end - actual_start).total_seconds())
    step = max(15, min(3600, seconds // 300 or 15))
    results = await asyncio.gather(
        *[
            _load_metric_range(
                request, key, unit, query, actual_start, actual_end, step
            )
            for key, (unit, query) in LOAD_QUERIES.items()
        ]
    )
    return LoadReport(
        start=actual_start,
        end=actual_end,
        metrics=[metric for metric, _ in results],
        warnings=[warning for _, warning in results if warning],
    )


@router.get("/health", response_model=HealthReport)
async def health_report(request: Request) -> HealthReport:
    try:
        targets_payload, alerts_payload = await asyncio.gather(
            request.app.state.observability.prometheus_targets(),
            request.app.state.observability.prometheus_alerts(),
        )
    except UpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    targets = []
    for target in targets_payload.get("data", {}).get("activeTargets", []):
        labels = target.get("labels", {})
        targets.append(
            HealthTarget(
                job=str(labels.get("job", "unknown")),
                instance=str(labels.get("instance", "unknown")),
                health=str(target.get("health", "unknown")),
                optional=str(labels.get("optional", "false")).lower() == "true",
                error=target.get("lastError") or None,
            )
        )
    alerts = alerts_payload.get("data", {}).get("alerts", [])
    firing = sum(item.get("state") == "firing" for item in alerts)
    required_targets = [item for item in targets if not item.optional]
    required_down = any(item.health != "up" for item in required_targets)
    if not required_targets:
        status_value = "unavailable"
    elif required_down or firing:
        status_value = "degraded"
    else:
        status_value = "healthy"
    return HealthReport(
        generated_at=datetime.now(timezone.utc),
        status=status_value,
        targets=sorted(targets, key=lambda item: (item.job, item.instance)),
        firing_alerts=firing,
    )


@router.get("/user-actions", response_model=AuditPage)
async def user_actions_report(
    start: datetime | None = None,
    end: datetime | None = None,
    actor_id: uuid.UUID | None = None,
    action: str | None = Query(default=None, min_length=1, max_length=100),
    result: str | None = Query(default=None, pattern="^(?i:SUCCESS|FAILURE|DENIED)$"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_admin_read_session),
) -> AuditPage:
    actual_start, actual_end = _period(start, end, default=timedelta(days=7))
    filters = _audit_filters(
        start=actual_start,
        end=actual_end,
        actor_id=actor_id,
        action=action,
        result=result,
    )
    total = await session.scalar(
        select(func.count()).select_from(AuditEvent).where(*filters)
    )
    events = (
        await session.scalars(
            select(AuditEvent)
            .where(*filters)
            .order_by(AuditEvent.occurred_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return AuditPage(
        items=[_audit_item(event) for event in events],
        total=int(total or 0),
        limit=limit,
        offset=offset,
    )


@router.get("/user-actions/export")
async def export_user_actions(
    request: Request,
    start: datetime | None = None,
    end: datetime | None = None,
    actor_id: uuid.UUID | None = None,
    action: str | None = Query(default=None, min_length=1, max_length=100),
    result: str | None = Query(default=None, pattern="^(?i:SUCCESS|FAILURE|DENIED)$"),
    session: AsyncSession = Depends(get_admin_read_session),
) -> StreamingResponse:
    actual_start, actual_end = _period(start, end, default=timedelta(days=7))
    filters = _audit_filters(
        start=actual_start,
        end=actual_end,
        actor_id=actor_id,
        action=action,
        result=result,
    )
    events = (
        await session.scalars(
            select(AuditEvent)
            .where(*filters)
            .order_by(AuditEvent.occurred_at.desc())
            .limit(request.app.state.settings.max_log_export_rows)
        )
    ).all()
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        [
            "occurred_at",
            "actor_id",
            "actor_username",
            "action",
            "target_type",
            "target_id",
            "result",
            "details",
            "ip_address",
            "request_id",
        ]
    )
    for event in events:
        writer.writerow(
            [
                event.occurred_at.isoformat(),
                event.actor_id,
                event.actor_username,
                event.action,
                event.target_type,
                event.target_id,
                event.result,
                json.dumps(event.details, ensure_ascii=False),
                event.ip_address,
                event.request_id,
            ]
        )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="user-actions-{stamp}.csv"'
        },
    )
