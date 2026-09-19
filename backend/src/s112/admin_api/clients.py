from __future__ import annotations

import asyncio
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class UpstreamError(RuntimeError):
    def __init__(self, service: str, detail: str) -> None:
        super().__init__(f"{service}: {detail}")
        self.service = service
        self.detail = detail


class ObservabilityClient:
    def __init__(self, *, prometheus_url: str, loki_url: str, timeout: float) -> None:
        self.prometheus_url = prometheus_url.rstrip("/")
        self.loki_url = loki_url.rstrip("/")
        self.timeout = timeout

    async def prometheus_query(self, query: str, timestamp: float | None = None) -> dict[str, Any]:
        params: dict[str, object] = {"query": query}
        if timestamp is not None:
            params["time"] = timestamp
        return await self._get_json("prometheus", self.prometheus_url, "/api/v1/query", params)

    async def prometheus_query_range(
        self, *, query: str, start: float, end: float, step: int
    ) -> dict[str, Any]:
        return await self._get_json(
            "prometheus",
            self.prometheus_url,
            "/api/v1/query_range",
            {"query": query, "start": start, "end": end, "step": step},
        )

    async def prometheus_targets(self) -> dict[str, Any]:
        return await self._get_json(
            "prometheus", self.prometheus_url, "/api/v1/targets", {"state": "active"}
        )

    async def prometheus_alerts(self) -> dict[str, Any]:
        return await self._get_json("prometheus", self.prometheus_url, "/api/v1/alerts")

    async def loki_query_range(
        self,
        *,
        query: str,
        start_ns: int,
        end_ns: int,
        limit: int,
        direction: str = "backward",
    ) -> dict[str, Any]:
        return await self._get_json(
            "loki",
            self.loki_url,
            "/loki/api/v1/query_range",
            {
                "query": query,
                "start": start_ns,
                "end": end_ns,
                "limit": limit,
                "direction": direction,
            },
        )

    async def loki_query(self, query: str, timestamp: float | None = None) -> dict[str, Any]:
        params: dict[str, object] = {"query": query}
        if timestamp is not None:
            params["time"] = int(timestamp * 1_000_000_000)
        return await self._get_json("loki", self.loki_url, "/loki/api/v1/query", params)

    async def loki_label_values(self, label: str) -> dict[str, Any]:
        return await self._get_json(
            "loki", self.loki_url, f"/loki/api/v1/label/{label}/values"
        )

    async def readiness(self, service: str) -> bool:
        base_url, path = {
            "prometheus": (self.prometheus_url, "/-/ready"),
            "loki": (self.loki_url, "/ready"),
        }[service]
        try:
            await asyncio.to_thread(self._request_text, base_url, path, None)
        except UpstreamError:
            return False
        return True

    async def _get_json(
        self,
        service: str,
        base_url: str,
        path: str,
        params: dict[str, object] | None = None,
    ) -> dict[str, Any]:
        text = await asyncio.to_thread(self._request_text, base_url, path, params)
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise UpstreamError(service, "returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise UpstreamError(service, "returned an unexpected response")
        if payload.get("status") == "error":
            raise UpstreamError(service, str(payload.get("error", "query failed")))
        return payload

    def _request_text(
        self,
        base_url: str,
        path: str,
        params: dict[str, object] | None,
    ) -> str:
        query_string = f"?{urlencode(params)}" if params else ""
        request = Request(
            f"{base_url}{path}{query_string}",
            headers={"Accept": "application/json", "User-Agent": "s112-admin-api/0.1"},
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return response.read().decode("utf-8")
        except HTTPError as exc:
            detail = exc.read(512).decode("utf-8", errors="replace")
            raise UpstreamError(base_url, f"HTTP {exc.code}: {detail}") from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise UpstreamError(base_url, str(exc)) from exc


def prometheus_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    data = payload.get("data", {})
    results = data.get("result", []) if isinstance(data, dict) else []
    return results if isinstance(results, list) else []


def sample_value(result: dict[str, Any]) -> float | None:
    value = result.get("value")
    if not isinstance(value, list) or len(value) != 2:
        return None
    try:
        return float(value[1])
    except (TypeError, ValueError):
        return None
