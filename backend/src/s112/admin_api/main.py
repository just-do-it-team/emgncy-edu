from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from s112.admin_api.clients import ObservabilityClient
from s112.admin_api.backups.api import router as backups_router
from s112.admin_api.logs.api import router as logs_router
from s112.admin_api.monitoring.api import router as monitoring_router
from s112.admin_api.overview.api import router as overview_router
from s112.admin_api.reports.api import router as reports_router
from s112.admin_api.security.api import router as security_router
from s112.admin_api.services.api import router as services_router
from s112.admin_api.settings import AdminSettings, get_admin_settings
from s112.admin_api.updates.api import router as updates_router
from s112.admin_api.users.api import router as users_router
from s112.auth.dependencies import require_auth_if_enabled
from s112.auth.settings import AuthSettings, get_auth_settings
from s112.common.database import Database


def create_app(
    *,
    settings: AdminSettings | None = None,
    auth_settings: AuthSettings | None = None,
    database: Database | None = None,
) -> FastAPI:
    app_settings = settings or get_admin_settings()
    app_auth_settings = auth_settings or get_auth_settings()
    app_database = database or Database(
        app_settings.database_url, app_settings.read_database_url
    )
    owns_database = database is None
    client = ObservabilityClient(
        prometheus_url=app_settings.prometheus_url,
        loki_url=app_settings.loki_url,
        timeout=app_settings.request_timeout_seconds,
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        if owns_database:
            await app_database.dispose()

    app = FastAPI(
        title="System-112 Admin API",
        description=(
            "API for administration, reports and observability. "
            "Shared JWT authentication can be enabled with S112_AUTH_ENABLED."
        ),
        version="0.2.0",
        lifespan=lifespan,
        dependencies=[Depends(require_auth_if_enabled)],
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.observability = client
    app.state.settings = app_settings
    app.state.auth_settings = app_auth_settings
    app.state.database = app_database
    admin_router = APIRouter(prefix="/api/v1/admin")
    admin_router.include_router(overview_router)
    admin_router.include_router(monitoring_router)
    admin_router.include_router(logs_router)
    admin_router.include_router(users_router)
    admin_router.include_router(reports_router)
    admin_router.include_router(services_router)
    admin_router.include_router(backups_router)
    admin_router.include_router(updates_router)
    admin_router.include_router(security_router)
    app.include_router(admin_router)

    @app.get("/health", tags=["service"])
    async def health(request: Request) -> dict[str, object]:
        async def database_ready() -> bool:
            try:
                async with request.app.state.database.write_session_factory() as session:
                    await session.execute(text("SELECT 1"))
            except Exception:
                return False
            return True

        prometheus_ready, loki_ready, db_ready = await asyncio.gather(
            request.app.state.observability.readiness("prometheus"),
            request.app.state.observability.readiness("loki"),
            database_ready(),
        )
        return {
            "status": "ok" if prometheus_ready and loki_ready and db_ready else "degraded",
            "service": app_settings.service_name,
            "dependencies": {
                "prometheus": "ok" if prometheus_ready else "unavailable",
                "loki": "ok" if loki_ready else "unavailable",
                "database": "ok" if db_ready else "unavailable",
            },
        }

    return app


app = create_app()
