from __future__ import annotations

import uuid
from datetime import datetime, timezone

from httpx import AsyncClient
from sqlalchemy import func, select

from s112.common.database import Database
from s112.domain.models import (
    CardFeatureHistory,
    CardListProjection,
    OutboxEvent,
)
from tests.conftest import (
    EVENT_KIND_FIRE_ID,
    EVENT_KIND_POLICE_ID,
    EVENT_TYPE_101_ID,
    FIRST_HOUSE_ID,
    FIRST_TRANSPORT_ID,
    SECOND_APARTMENT_ID,
    SERVICE_101_ID,
)


def card_payload() -> dict:
    return {
        "card_number": "TEST-0001",
        "source_type": "CALL",
        "event_type_id": EVENT_TYPE_101_ID,
        "description": "Открытое пламя в окне",
        "incident_address": "Москва, тестовый адрес",
        "victims_count": 2,
        "features": {
            "event_kind_id": EVENT_KIND_FIRE_ID,
            "first_order_feature_id": FIRST_HOUSE_ID,
            "second_order_feature_id": SECOND_APARTMENT_ID,
            "additional_features": {
                "fire_manifestation": "OPEN_FLAME_SMOKE",
                "no_access": True,
            },
        },
    }


async def test_create_card_writes_projection_history_and_outbox(
    client: AsyncClient, database: Database
) -> None:
    response = await client.post("/api/v1/cards", json=card_payload())

    assert response.status_code == 201, response.text
    data = response.json()
    assert data["event_type_id"] == EVENT_TYPE_101_ID
    assert data["victims_count"] == 2
    assert data["features"]["event_kind_id"] == EVENT_KIND_FIRE_ID
    assert data["features"]["additional_features"]["no_access"] is True

    list_response = await client.get("/api/v1/cards")
    assert list_response.status_code == 200
    assert list_response.json()[0]["features_summary"]["first_order_feature_id"] == FIRST_HOUSE_ID

    async with database.read_session_factory() as session:
        assert await session.scalar(select(func.count()).select_from(OutboxEvent)) == 1
        assert await session.scalar(select(func.count()).select_from(CardFeatureHistory)) == 1
        projection = await session.get(CardListProjection, uuid.UUID(data["id"]))
        assert projection is not None
        assert projection.version == 1


async def test_event_kind_must_belong_to_card_event_type(client: AsyncClient) -> None:
    payload = card_payload()
    payload["card_number"] = "TEST-INVALID-KIND"
    payload["features"]["event_kind_id"] = EVENT_KIND_POLICE_ID
    payload["features"]["first_order_feature_id"] = None
    payload["features"]["second_order_feature_id"] = None

    response = await client.post("/api/v1/cards", json=payload)

    assert response.status_code == 422
    assert "does not belong" in response.json()["detail"]


async def test_second_order_feature_must_belong_to_first_order(client: AsyncClient) -> None:
    payload = card_payload()
    payload["card_number"] = "TEST-INVALID-SECOND"
    payload["features"]["first_order_feature_id"] = FIRST_TRANSPORT_ID

    response = await client.post("/api/v1/cards", json=payload)

    assert response.status_code == 422
    assert "Second-order feature" in response.json()["detail"]


async def test_negative_victims_count_is_rejected(client: AsyncClient) -> None:
    payload = card_payload()
    payload["victims_count"] = -1

    response = await client.post("/api/v1/cards", json=payload)

    assert response.status_code == 422


async def test_optimistic_version_prevents_lost_update(client: AsyncClient) -> None:
    created = await client.post("/api/v1/cards", json=card_payload())
    card_id = created.json()["id"]

    first = await client.patch(
        f"/api/v1/cards/{card_id}",
        json={"expected_version": 1, "description": "Уточнённое описание"},
    )
    second = await client.patch(
        f"/api/v1/cards/{card_id}",
        json={"expected_version": 1, "description": "Устаревшее изменение"},
    )

    assert first.status_code == 200
    assert first.json()["version"] == 2
    assert second.status_code == 409


async def test_rejected_service_status_requires_comment(client: AsyncClient) -> None:
    created = await client.post("/api/v1/cards", json=card_payload())
    card_id = created.json()["id"]
    added = await client.post(
        f"/api/v1/cards/{card_id}/services",
        json={
            "service_id": str(SERVICE_101_ID),
            "expected_card_version": 1,
            "notification_method": "INTEGRATION",
        },
    )
    assert added.status_code == 201, added.text
    card_service_id = added.json()["id"]

    invalid = await client.post(
        f"/api/v1/card-services/{card_service_id}/statuses",
        json={
            "status": "REJECTED",
            "expected_card_version": 2,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    valid = await client.post(
        f"/api/v1/card-services/{card_service_id}/statuses",
        json={
            "status": "REJECTED",
            "expected_card_version": 2,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "comment": "Территория не обслуживается; информация передана профильной службе",
        },
    )

    assert invalid.status_code == 422
    assert valid.status_code == 201, valid.text
    assert valid.json()["status_code"] == "REJECTED"

    history = await client.get(
        f"/api/v1/card-services/{card_service_id}/status-history"
    )
    assert history.status_code == 200
    assert [item["status_code"] for item in history.json()] == ["ADDED", "REJECTED"]
