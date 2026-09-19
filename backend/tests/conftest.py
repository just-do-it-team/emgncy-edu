from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from s112.api.main import create_app
from s112.common.config import Settings
from s112.common.database import Database
from s112.domain.base import Base
from s112.domain.models import (
    EmergencyService,
    EventKind,
    EventType,
    FirstOrderFeature,
    SecondOrderFeature,
    SimulationWorkspace,
    SYSTEM_WORKSPACE_ID,
    UserAccount,
)


EVENT_TYPE_101_ID = 1
EVENT_TYPE_102_ID = 2
EVENT_KIND_FIRE_ID = 10
EVENT_KIND_POLICE_ID = 20
FIRST_HOUSE_ID = 100
FIRST_TRANSPORT_ID = 101
SECOND_APARTMENT_ID = 200
SERVICE_101_ID = uuid.UUID("f44838f4-3a17-46d5-a53a-7398f53f2e3a")
TEACHER_ID = uuid.UUID("a4d99c61-faa5-48dd-9e8e-e92984d2765b")
STUDENT_ID = uuid.UUID("bdeec38f-89a9-42be-9e62-9256195565ad")


@pytest_asyncio.fixture
async def database() -> AsyncIterator[Database]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    database = Database(
        "sqlite+aiosqlite:///:memory:",
        write_engine=engine,
        read_engine=engine,
    )
    async with database.write_session_factory() as session:
        async with session.begin():
            session.add_all(
                [
                    SimulationWorkspace(
                        id=SYSTEM_WORKSPACE_ID,
                        mode="INDIVIDUAL",
                        status="ACTIVE",
                    ),
                    UserAccount(
                        id=TEACHER_ID,
                        username="teacher",
                        normalized_username="TEACHER",
                        display_name="Преподаватель",
                        password_hash="test-only",
                        role="TEACHER",
                    ),
                    UserAccount(
                        id=STUDENT_ID,
                        username="student",
                        normalized_username="STUDENT",
                        display_name="Обучаемый",
                        password_hash="test-only",
                        role="STUDENT",
                    ),
                    EventType(id=EVENT_TYPE_101_ID, code="101", name="Спасательная служба"),
                    EventType(id=EVENT_TYPE_102_ID, code="102", name="102"),
                    EventKind(
                        id=EVENT_KIND_FIRE_ID,
                        event_type_id=EVENT_TYPE_101_ID,
                        code="9",
                        name="Пожары",
                    ),
                    EventKind(
                        id=EVENT_KIND_POLICE_ID,
                        event_type_id=EVENT_TYPE_102_ID,
                        code="28",
                        name="Прочее",
                    ),
                    FirstOrderFeature(
                        id=FIRST_HOUSE_ID,
                        event_kind_id=EVENT_KIND_FIRE_ID,
                        code="HOUSE",
                        name="Дом",
                    ),
                    FirstOrderFeature(
                        id=FIRST_TRANSPORT_ID,
                        event_kind_id=EVENT_KIND_FIRE_ID,
                        code="TRANSPORT",
                        name="Транспорт",
                    ),
                    SecondOrderFeature(
                        id=SECOND_APARTMENT_ID,
                        first_order_feature_id=FIRST_HOUSE_ID,
                        code="APARTMENT_HOUSE",
                        name="Дом многоквартирный",
                    ),
                    EmergencyService(
                        id=SERVICE_101_ID,
                        code="101",
                        name="Служба 101",
                    ),
                ]
            )

    try:
        yield database
    finally:
        await database.dispose()


@pytest_asyncio.fixture
async def client(database: Database) -> AsyncIterator[AsyncClient]:
    settings = Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        read_database_url="sqlite+aiosqlite:///:memory:",
        kafka_topic="card.events",
    )
    app = create_app(settings=settings, database=database)
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as http_client:
        yield http_client
