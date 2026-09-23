from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from s112.common.config import Settings, get_settings
from s112.common.database import Database
from s112.auth.dependencies import require_auth_if_enabled
from s112.auth.settings import get_auth_settings
from s112.domain.models import WorkspaceMember
import uuid
from s112.realtime_gateway.consumer import RealtimeKafkaConsumer
from s112.realtime_gateway.hub import RealtimeHub


def format_sse(event: dict) -> str:
    event_id = str(event.get("event_id", ""))
    event_type = str(event.get("event_type", "message"))
    data = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
    return f"id: {event_id}\nevent: {event_type}\ndata: {data}\n\n"


def create_app(
    *,
    settings: Settings | None = None,
    hub: RealtimeHub | None = None,
    start_consumer: bool = True,
) -> FastAPI:
    app_settings = settings or get_settings()
    app_hub = hub or RealtimeHub(app_settings.sse_client_queue_size)
    consumer = RealtimeKafkaConsumer(app_settings, app_hub) if start_consumer else None
    auth_settings = get_auth_settings()
    database = Database.from_settings(app_settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if consumer:
            await consumer.start()
        try:
            yield
        finally:
            if consumer:
                await consumer.stop()
            await database.dispose()

    app = FastAPI(title="System-112 Realtime Gateway", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[            "http://localhost:5173",
            "http://127.0.0.1:5173",],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.hub = app_hub
    app.state.settings = app_settings
    app.state.auth_settings = auth_settings
    app.state.database = database

    @app.get("/health")
    async def health() -> dict[str, object]:
        return {
            "status": "ok",
            "service": "realtime-gateway",
            "connections": app_hub.connection_count,
        }

    @app.get("/events")
    async def events(
        request: Request,
        card_id: str | None = Query(default=None),
        workspace_id: str | None = Query(default=None),
        teacher_id: str | None = Query(default=None),
        _principal: object = Depends(require_auth_if_enabled),
    ) -> StreamingResponse:
        if auth_settings.enabled:
            principal = request.state.principal
            if not workspace_id or teacher_id and teacher_id != str(principal.user_id):
                raise HTTPException(status_code=403, detail="Workspace subscription required")
            try:
                workspace_uuid = uuid.UUID(workspace_id)
            except ValueError as exc:
                raise HTTPException(status_code=422, detail="Invalid workspace_id") from exc
            async with database.write_session_factory() as db_session:
                member = await db_session.get(WorkspaceMember, (workspace_uuid, principal.user_id))
                if member is None or member.left_at is not None:
                    raise HTTPException(status_code=403, detail="Workspace membership required")
        async def event_stream() -> AsyncIterator[str]:
            yield "retry: 3000\n\n"
            async with app_hub.subscribe(
                card_id=card_id,
                workspace_id=workspace_id,
                teacher_id=teacher_id,
            ) as subscription:
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        event = await asyncio.wait_for(
                            subscription.queue.get(),
                            timeout=app_settings.sse_heartbeat_seconds,
                        )
                    except asyncio.TimeoutError:
                        yield ": heartbeat\n\n"
                        continue
                    yield format_sse(event)

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return app


app = create_app()
