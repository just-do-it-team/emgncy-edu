from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from s112.auth.api import router
from s112.auth.settings import AuthSettings, get_auth_settings
from s112.common.config import Settings, get_settings
from s112.common.database import Database


def create_app(
    *,
    settings: Settings | None = None,
    auth_settings: AuthSettings | None = None,
    database: Database | None = None,
) -> FastAPI:
    app_settings = settings or get_settings()
    app_auth_settings = auth_settings or get_auth_settings()
    app_database = database or Database.from_settings(app_settings)
    owns_database = database is None

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:
            yield
        finally:
            if owns_database:
                await app_database.dispose()

    app = FastAPI(
        title="System-112 Auth API",
        description="Локальная аутентификация и выпуск JWT для сервисов System-112.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.database = app_database
    app.state.settings = app_settings
    app.state.auth_settings = app_auth_settings
    app.include_router(router)

    @app.get("/health", tags=["service"])
    async def health(request: Request) -> dict[str, str]:
        try:
            async with request.app.state.database.write_session_factory() as session:
                await session.execute(text("SELECT 1"))
        except Exception:
            return {"status": "degraded", "database": "unavailable"}
        return {"status": "ok", "database": "ok"}

    return app


app = create_app()
