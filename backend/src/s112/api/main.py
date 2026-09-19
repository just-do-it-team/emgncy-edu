from contextlib import asynccontextmanager

from fastapi import FastAPI

from s112.api.routes import router
from s112.api.simulation_routes import router as simulation_router
from s112.common.config import Settings, get_settings
from s112.common.database import Database


def create_app(
    *, settings: Settings | None = None, database: Database | None = None
) -> FastAPI:
    app_settings = settings or get_settings()
    app_database = database or Database.from_settings(app_settings)
    owns_database = database is None

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        if owns_database:
            await app_database.dispose()

    app = FastAPI(
        title="System-112 Card API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.database = app_database
    app.state.settings = app_settings
    app.include_router(router)
    app.include_router(simulation_router)
    return app


app = create_app()
