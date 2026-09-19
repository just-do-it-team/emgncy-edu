from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from s112.admin_api.clients import (
    ObservabilityClient,
    UpstreamError,
    prometheus_results,
    sample_value,
)


router = APIRouter(prefix="/overview", tags=["overview"])


class ComponentStatus(BaseModel):
    name: str
    instance: str
    status: Literal["healthy", "unhealthy", "unknown"]
    last_scrape_at: str | None = None
    scrape_duration_seconds: float | None = None
    error: str | None = None
    optional: bool = False


class ComponentTotals(BaseModel):
    healthy: int
    total: int
    optional_unavailable: int = 0


class HostSummary(BaseModel):
    cpu_percent: float | None = None
    memory_percent: float | None = None
    disk_percent: float | None = None
    network_receive_bytes_per_second: float | None = None
    network_transmit_bytes_per_second: float | None = None
    uptime_seconds: float | None = None


class GpuSummary(BaseModel):
    available: bool
    utilization_percent: float | None = None
    memory_used_mib: float | None = None
    memory_total_mib: float | None = None
    temperature_celsius: float | None = None
    power_watts: float | None = None


class OverviewSummary(BaseModel):
    generated_at: datetime
    status: Literal["healthy", "degraded", "unavailable"]
    components: ComponentTotals
    firing_alerts: int
    errors_24h: int | None = None
    host: HostSummary
    gpu: GpuSummary
    postgres_up: bool | None = None
    kafka_brokers: int | None = None
    kafka_consumer_lag: float | None = None
    warnings: list[str] = Field(default_factory=list)


class SystemEvent(BaseModel):
    timestamp: datetime
    service: str
    level: str
    message: str
    labels: dict[str, str]


PROMETHEUS_QUERIES = {
    "cpu_percent": "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)",
    "memory_percent": (
        "100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))"
    ),
    "disk_percent": (
        "max(100 * (1 - (node_filesystem_avail_bytes{fstype!~\"tmpfs|overlay|squashfs\"} "
        "/ node_filesystem_size_bytes{fstype!~\"tmpfs|overlay|squashfs\"})))"
    ),
    "network_receive": "sum(rate(node_network_receive_bytes_total{device!=\"lo\"}[5m]))",
    "network_transmit": "sum(rate(node_network_transmit_bytes_total{device!=\"lo\"}[5m]))",
    "uptime": "time() - node_boot_time_seconds",
    "gpu_utilization": "avg(nvidia_smi_utilization_gpu_ratio) * 100",
    "gpu_memory_used": "sum(nvidia_smi_memory_used_bytes) / 1024 / 1024",
    "gpu_memory_total": "sum(nvidia_smi_memory_total_bytes) / 1024 / 1024",
    "gpu_temperature": "max(nvidia_smi_temperature_gpu)",
    "gpu_power": "sum(nvidia_smi_power_draw_watts)",
    "postgres_up": "max(pg_up)",
    "kafka_brokers": "max(kafka_brokers)",
    "kafka_lag": "sum(kafka_consumergroup_lag)",
}


def _client(request: Request) -> ObservabilityClient:
    return request.app.state.observability


async def _optional_query(
    client: ObservabilityClient, name: str, query: str
) -> tuple[str, float | None, str | None]:
    try:
        results = prometheus_results(await client.prometheus_query(query))
        value = sample_value(results[0]) if results else None
        return name, value, None
    except UpstreamError as exc:
        return name, None, f"Prometheus query '{name}' failed: {exc.detail}"


def _component_list(payload: dict[str, Any]) -> list[ComponentStatus]:
    data = payload.get("data", {})
    active_targets = data.get("activeTargets", []) if isinstance(data, dict) else []
    components: list[ComponentStatus] = []
    for target in active_targets:
        labels = target.get("labels", {})
        health = str(target.get("health", "unknown"))
        status: Literal["healthy", "unhealthy", "unknown"]
        if health == "up":
            status = "healthy"
        elif health == "down":
            status = "unhealthy"
        else:
            status = "unknown"
        components.append(
            ComponentStatus(
                name=str(labels.get("job", "unknown")),
                instance=str(labels.get("instance", "unknown")),
                status=status,
                last_scrape_at=target.get("lastScrape") or None,
                scrape_duration_seconds=target.get("lastScrapeDuration"),
                error=target.get("lastError") or None,
                optional=str(labels.get("optional", "false")).lower() == "true",
            )
        )
    return sorted(components, key=lambda item: (item.name, item.instance))


@router.get("", response_model=OverviewSummary)
async def get_overview(request: Request) -> OverviewSummary:
    client = _client(request)
    metric_tasks = [
        _optional_query(client, name, query) for name, query in PROMETHEUS_QUERIES.items()
    ]
    target_result, alert_result, error_result, *metric_results = await asyncio.gather(
        client.prometheus_targets(),
        client.prometheus_alerts(),
        client.loki_query(
            'sum(count_over_time({service=~".+"} |~ "(?i)(error|critical|exception)" [24h]))'
        ),
        *metric_tasks,
        return_exceptions=True,
    )

    warnings: list[str] = []
    components: list[ComponentStatus] = []
    if isinstance(target_result, Exception):
        warnings.append(f"Prometheus targets unavailable: {target_result}")
    else:
        components = _component_list(target_result)

    firing_alerts = 0
    if isinstance(alert_result, Exception):
        warnings.append(f"Prometheus alerts unavailable: {alert_result}")
    else:
        alerts = alert_result.get("data", {}).get("alerts", [])
        firing_alerts = sum(item.get("state") == "firing" for item in alerts)

    errors_24h: int | None = None
    if isinstance(error_result, Exception):
        warnings.append(f"Loki error count unavailable: {error_result}")
    else:
        results = prometheus_results(error_result)
        value = sample_value(results[0]) if results else 0
        errors_24h = int(value) if value is not None else None

    values: dict[str, float | None] = {}
    for result in metric_results:
        if isinstance(result, Exception):
            warnings.append(str(result))
            continue
        name, value, warning = result
        values[name] = value
        if warning:
            warnings.append(warning)

    required_components = [item for item in components if not item.optional]
    healthy_count = sum(item.status == "healthy" for item in required_components)
    optional_unavailable = sum(
        item.optional and item.status != "healthy" for item in components
    )
    if not required_components:
        overall_status: Literal["healthy", "degraded", "unavailable"] = "unavailable"
    elif healthy_count == len(required_components) and firing_alerts == 0:
        overall_status = "healthy"
    else:
        overall_status = "degraded"

    gpu_available = values.get("gpu_utilization") is not None
    return OverviewSummary(
        generated_at=datetime.now(timezone.utc),
        status=overall_status,
        components=ComponentTotals(
            healthy=healthy_count,
            total=len(required_components),
            optional_unavailable=optional_unavailable,
        ),
        firing_alerts=firing_alerts,
        errors_24h=errors_24h,
        host=HostSummary(
            cpu_percent=values.get("cpu_percent"),
            memory_percent=values.get("memory_percent"),
            disk_percent=values.get("disk_percent"),
            network_receive_bytes_per_second=values.get("network_receive"),
            network_transmit_bytes_per_second=values.get("network_transmit"),
            uptime_seconds=values.get("uptime"),
        ),
        gpu=GpuSummary(
            available=gpu_available,
            utilization_percent=values.get("gpu_utilization"),
            memory_used_mib=values.get("gpu_memory_used"),
            memory_total_mib=values.get("gpu_memory_total"),
            temperature_celsius=values.get("gpu_temperature"),
            power_watts=values.get("gpu_power"),
        ),
        postgres_up=(values["postgres_up"] == 1) if values.get("postgres_up") is not None else None,
        kafka_brokers=(
            int(values["kafka_brokers"])
            if values.get("kafka_brokers") is not None
            else None
        ),
        kafka_consumer_lag=values.get("kafka_lag"),
        warnings=warnings,
    )


@router.get("/components", response_model=list[ComponentStatus])
async def get_components(request: Request) -> list[ComponentStatus]:
    try:
        return _component_list(await _client(request).prometheus_targets())
    except UpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/events", response_model=list[SystemEvent])
async def get_recent_events(
    request: Request,
    hours: int = Query(default=24, ge=1, le=168),
    limit: int = Query(default=20, ge=1, le=200),
) -> list[SystemEvent]:
    now = datetime.now(timezone.utc)
    try:
        payload = await _client(request).loki_query_range(
            query='{service=~".+"} |~ "(?i)(warning|error|critical|exception)"',
            start_ns=int((now - timedelta(hours=hours)).timestamp() * 1_000_000_000),
            end_ns=int(now.timestamp() * 1_000_000_000),
            limit=limit,
        )
    except UpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    events: list[SystemEvent] = []
    for stream in prometheus_results(payload):
        labels = {str(key): str(value) for key, value in stream.get("stream", {}).items()}
        service = labels.get("service", labels.get("container", "unknown"))
        for timestamp_ns, line in stream.get("values", []):
            lowered = str(line).lower()
            level = "critical" if "critical" in lowered else "error" if "error" in lowered or "exception" in lowered else "warning"
            events.append(
                SystemEvent(
                    timestamp=datetime.fromtimestamp(int(timestamp_ns) / 1_000_000_000, tz=timezone.utc),
                    service=service,
                    level=level,
                    message=str(line),
                    labels=labels,
                )
            )
    return sorted(events, key=lambda item: item.timestamp, reverse=True)[:limit]
