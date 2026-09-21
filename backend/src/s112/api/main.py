from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from s112.api.routes import router
from s112.api.simulation_routes import router as simulation_router
from s112.audio.storage import SeaweedStorage
from s112.common.config import Settings, get_settings
from s112.common.database import Database


def create_app(
    *,
    settings: Settings | None = None,
    database: Database | None = None,
    audio_storage: SeaweedStorage | None = None,
) -> FastAPI:
    app_settings = settings or get_settings()
    app_database = database or Database.from_settings(app_settings)
    owns_database = database is None
    app_audio_storage = audio_storage or SeaweedStorage(app_settings)
    owns_audio_storage = audio_storage is None

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:
            yield
        finally:
            try:
                if owns_audio_storage:
                    await app_audio_storage.close()
            finally:
                if owns_database:
                    await app_database.dispose()

    app = FastAPI(
        title="System-112 Card API",
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
    app.state.audio_storage = app_audio_storage
    app.include_router(router)
    app.include_router(simulation_router)
    return app


app = create_app()
