from __future__ import annotations

import asyncio
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from s112.admin_api.clients import ObservabilityClient, UpstreamError, prometheus_results


router = APIRouter(prefix="/monitoring", tags=["monitoring"])


class MetricDefinition(BaseModel):
    key: str
    title: str
    category: Literal["host", "containers", "gpu", "postgres", "kafka", "services"]
    unit: str
    description: str
    optional: bool = False


class MetricSample(BaseModel):
    labels: dict[str, str]
    value: float
    timestamp: datetime


class CurrentMetric(BaseModel):
    key: str
    unit: str
    samples: list[MetricSample]


class TimePoint(BaseModel):
    timestamp: datetime
    value: float


class TimeSeries(BaseModel):
    labels: dict[str, str]
    points: list[TimePoint]


class MetricRangeResponse(BaseModel):
    key: str
    unit: str
    start: datetime
    end: datetime
    step_seconds: int
    series: list[TimeSeries]


class MonitoringTarget(BaseModel):
    job: str
    instance: str
    health: Literal["up", "down", "unknown"]
    last_scrape_at: str | None = None
    scrape_duration_seconds: float | None = None
    error: str | None = None
    optional: bool = False


class AlertItem(BaseModel):
    name: str
    state: str
    severity: str
    active_at: str | None = None
    summary: str | None = None
    description: str | None = None
    labels: dict[str, str] = Field(default_factory=dict)


class DashboardLink(BaseModel):
    key: str
    title: str
    url: str
    mode: Literal["embedded", "external"] = "embedded"


METRICS: dict[str, tuple[MetricDefinition, str]] = {
    "host_cpu_percent": (
        MetricDefinition(key="host_cpu_percent", title="CPU", category="host", unit="percent", description="Средняя загрузка процессоров Linux-хоста"),
        "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)",
    ),
    "host_memory_percent": (
        MetricDefinition(key="host_memory_percent", title="Оперативная память", category="host", unit="percent", description="Использование оперативной памяти Linux-хоста"),
        "100 * (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes))",
    ),
    "host_disk_percent": (
        MetricDefinition(key="host_disk_percent", title="Файловые системы", category="host", unit="percent", description="Использование дисков по точкам монтирования"),
        "100 * (1 - (node_filesystem_avail_bytes{fstype!~\"tmpfs|overlay|squashfs\"} / node_filesystem_size_bytes{fstype!~\"tmpfs|overlay|squashfs\"}))",
    ),
    "host_network_receive": (
        MetricDefinition(key="host_network_receive", title="Входящий сетевой трафик", category="host", unit="bytes_per_second", description="Скорость приёма по сетевым интерфейсам"),
        "sum by (device) (rate(node_network_receive_bytes_total{device!=\"lo\"}[5m]))",
    ),
    "host_network_transmit": (
        MetricDefinition(key="host_network_transmit", title="Исходящий сетевой трафик", category="host", unit="bytes_per_second", description="Скорость передачи по сетевым интерфейсам"),
        "sum by (device) (rate(node_network_transmit_bytes_total{device!=\"lo\"}[5m]))",
    ),
    "container_cpu_percent": (
        MetricDefinition(key="container_cpu_percent", title="CPU контейнеров", category="containers", unit="percent", description="Загрузка CPU по Compose-сервисам"),
        "sum by (name) (rate(container_cpu_usage_seconds_total{name!=\"\"}[5m])) * 100",
    ),
    "container_memory_bytes": (
        MetricDefinition(key="container_memory_bytes", title="Память контейнеров", category="containers", unit="bytes", description="Рабочий набор памяти по контейнерам"),
        "sum by (name) (container_memory_working_set_bytes{name!=\"\"})",
    ),
    "gpu_utilization_percent": (
        MetricDefinition(key="gpu_utilization_percent", title="Загрузка GPU", category="gpu", unit="percent", description="Загрузка графических процессоров", optional=True),
        "nvidia_smi_utilization_gpu_ratio * 100",
    ),
    "gpu_memory_used_mib": (
        MetricDefinition(key="gpu_memory_used_mib", title="Видеопамять", category="gpu", unit="mebibytes", description="Использованная видеопамять", optional=True),
        "nvidia_smi_memory_used_bytes / 1024 / 1024",
    ),
    "gpu_temperature_celsius": (
        MetricDefinition(key="gpu_temperature_celsius", title="Температура GPU", category="gpu", unit="celsius", description="Температура графических процессоров", optional=True),
        "nvidia_smi_temperature_gpu",
    ),
    "gpu_power_watts": (
        MetricDefinition(key="gpu_power_watts", title="Энергопотребление GPU", category="gpu", unit="watts", description="Текущее энергопотребление GPU", optional=True),
        "nvidia_smi_power_draw_watts",
    ),
    "postgres_connections": (
        MetricDefinition(key="postgres_connections", title="Подключения PostgreSQL", category="postgres", unit="connections", description="Активные подключения по базам данных"),
        "sum by (datname) (pg_stat_database_numbackends)",
    ),
    "postgres_transactions": (
        MetricDefinition(key="postgres_transactions", title="Транзакции PostgreSQL", category="postgres", unit="operations_per_second", description="Скорость commit и rollback"),
        "sum(rate(pg_stat_database_xact_commit[5m]) + rate(pg_stat_database_xact_rollback[5m]))",
    ),
    "kafka_brokers": (
        MetricDefinition(key="kafka_brokers", title="Брокеры Kafka", category="kafka", unit="brokers", description="Количество доступных брокеров"),
        "kafka_brokers",
    ),
    "kafka_consumer_lag": (
        MetricDefinition(key="kafka_consumer_lag", title="Задержка потребителей Kafka", category="kafka", unit="messages", description="Суммарный lag по consumer groups"),
        "sum by (consumergroup, topic) (kafka_consumergroup_lag)",
    ),
    "service_availability": (
        MetricDefinition(key="service_availability", title="Доступность сервисов", category="services", unit="boolean", description="Результат HTTP-проверки компонентов"),
        "probe_success",
    ),
    "service_response_seconds": (
        MetricDefinition(key="service_response_seconds", title="Время ответа сервисов", category="services", unit="seconds", description="Продолжительность HTTP-проверки компонентов"),
        "probe_duration_seconds",
    ),
}


def _client(request: Request) -> ObservabilityClient:
    return request.app.state.observability


def _finite_float(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _resolve_keys(keys: str | None) -> list[str]:
    selected = list(METRICS) if not keys else [item.strip() for item in keys.split(",") if item.strip()]
    unknown = sorted(set(selected) - METRICS.keys())
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown metric keys: {', '.join(unknown)}")
    return list(dict.fromkeys(selected))


@router.get("/metrics", response_model=list[MetricDefinition])
async def list_metrics() -> list[MetricDefinition]:
    return [definition for definition, _ in METRICS.values()]


@router.get("/metrics/current", response_model=list[CurrentMetric])
async def get_current_metrics(
    request: Request,
    keys: str | None = Query(default=None, description="Comma-separated metric keys"),
) -> list[CurrentMetric]:
    selected = _resolve_keys(keys)
    responses = await asyncio.gather(
        *[_client(request).prometheus_query(METRICS[key][1]) for key in selected],
        return_exceptions=True,
    )
    output: list[CurrentMetric] = []
    upstream_errors: list[str] = []
    for key, payload in zip(selected, responses):
        if isinstance(payload, Exception):
            upstream_errors.append(f"{key}: {payload}")
            continue
        samples: list[MetricSample] = []
        for result in prometheus_results(payload):
            value = result.get("value", [])
            if not isinstance(value, list) or len(value) != 2:
                continue
            number = _finite_float(value[1])
            if number is None:
                continue
            samples.append(
                MetricSample(
                    labels={str(k): str(v) for k, v in result.get("metric", {}).items()},
                    value=number,
                    timestamp=datetime.fromtimestamp(float(value[0]), tz=timezone.utc),
                )
            )
        output.append(CurrentMetric(key=key, unit=METRICS[key][0].unit, samples=samples))
    if not output and upstream_errors:
        raise HTTPException(status_code=502, detail="; ".join(upstream_errors))
    return output


@router.get("/metrics/{metric_key}/series", response_model=MetricRangeResponse)
async def get_metric_series(
    metric_key: str,
    request: Request,
    start: datetime | None = None,
    end: datetime | None = None,
    step_seconds: int | None = Query(default=None, ge=5, le=3600),
) -> MetricRangeResponse:
    if metric_key not in METRICS:
        raise HTTPException(status_code=404, detail="Unknown metric key")
    actual_end = end or datetime.now(timezone.utc)
    actual_start = start or actual_end - timedelta(hours=1)
    if actual_start.tzinfo is None or actual_end.tzinfo is None:
        raise HTTPException(status_code=422, detail="start and end must include a timezone")
    if actual_start >= actual_end:
        raise HTTPException(status_code=422, detail="start must be earlier than end")
    range_seconds = int((actual_end - actual_start).total_seconds())
    if range_seconds > 30 * 24 * 3600:
        raise HTTPException(status_code=422, detail="Maximum range is 30 days")
    actual_step = step_seconds or max(15, min(3600, range_seconds // 300 or 15))

    try:
        payload = await _client(request).prometheus_query_range(
            query=METRICS[metric_key][1],
            start=actual_start.timestamp(),
            end=actual_end.timestamp(),
            step=actual_step,
        )
    except UpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    series: list[TimeSeries] = []
    for result in prometheus_results(payload):
        points: list[TimePoint] = []
        for timestamp, value in result.get("values", []):
            number = _finite_float(value)
            if number is not None:
                points.append(
                    TimePoint(
                        timestamp=datetime.fromtimestamp(float(timestamp), tz=timezone.utc),
                        value=number,
                    )
                )
        series.append(
            TimeSeries(
                labels={str(k): str(v) for k, v in result.get("metric", {}).items()},
                points=points,
            )
        )
    return MetricRangeResponse(
        key=metric_key,
        unit=METRICS[metric_key][0].unit,
        start=actual_start,
        end=actual_end,
        step_seconds=actual_step,
        series=series,
    )


@router.get("/targets", response_model=list[MonitoringTarget])
async def get_targets(request: Request) -> list[MonitoringTarget]:
    try:
        payload = await _client(request).prometheus_targets()
    except UpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    active_targets = payload.get("data", {}).get("activeTargets", [])
    targets: list[MonitoringTarget] = []
    for target in active_targets:
        labels = target.get("labels", {})
        health = target.get("health", "unknown")
        if health not in {"up", "down"}:
            health = "unknown"
        targets.append(
            MonitoringTarget(
                job=str(labels.get("job", "unknown")),
                instance=str(labels.get("instance", "unknown")),
                health=health,
                last_scrape_at=target.get("lastScrape") or None,
                scrape_duration_seconds=target.get("lastScrapeDuration"),
                error=target.get("lastError") or None,
                optional=str(labels.get("optional", "false")).lower() == "true",
            )
        )
    return sorted(targets, key=lambda item: (item.job, item.instance))


@router.get("/alerts", response_model=list[AlertItem])
async def get_alerts(request: Request) -> list[AlertItem]:
    try:
        payload = await _client(request).prometheus_alerts()
    except UpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    output: list[AlertItem] = []
    for alert in payload.get("data", {}).get("alerts", []):
        labels = {str(k): str(v) for k, v in alert.get("labels", {}).items()}
        annotations = alert.get("annotations", {})
        output.append(
            AlertItem(
                name=labels.get("alertname", "UnnamedAlert"),
                state=str(alert.get("state", "unknown")),
                severity=labels.get("severity", "unknown"),
                active_at=alert.get("activeAt"),
                summary=annotations.get("summary"),
                description=annotations.get("description"),
                labels=labels,
            )
        )
    return output


@router.get("/dashboards", response_model=list[DashboardLink])
async def get_dashboards(request: Request) -> list[DashboardLink]:
    base_url = request.app.state.settings.grafana_public_url.rstrip("/")
    return [
        DashboardLink(
            key="system-overview",
            title="Система-112: обзор стенда",
            url=f"{base_url}/d/s112-system-overview/system-112?orgId=1&kiosk",
        ),
        DashboardLink(
            key="logs",
            title="Системные журналы",
            url=f"{base_url}/explore?orgId=1&left={{\"datasource\":\"loki\"}}",
            mode="external",
        ),
    ]
