from __future__ import annotations

import uuid

from httpx import AsyncClient

from s112.common.database import Database
from s112.scenario_worker.worker import ScenarioSchedulerWorker
from tests.conftest import (
    EVENT_KIND_FIRE_ID,
    EVENT_TYPE_101_ID,
    EVENT_TYPE_102_ID,
    FIRST_HOUSE_ID,
    SECOND_APARTMENT_ID,
    STUDENT_ID,
    TEACHER_ID,
)


def template_payload() -> dict:
    return {
        "name": "Проверка карточки пожара",
        "difficulty": 2,
        "created_by": str(TEACHER_ID),
        "initial_card": {
            "source_type": "CALL",
            "event_type_id": EVENT_TYPE_101_ID,
            "description": "Открытое пламя в окне",
            "incident_address": "Учебный адрес",
            "victims_count": 0,
            "features": {
                "event_kind_id": EVENT_KIND_FIRE_ID,
                "first_order_feature_id": FIRST_HOUSE_ID,
                "second_order_feature_id": SECOND_APARTMENT_ID,
                "additional_features": {"fire_manifestation": "OPEN_FLAME_SMOKE"},
            },
        },
        "expected_result": {
            "final_state": {
                "event_type_id": EVENT_TYPE_101_ID,
                "victims_count": 0,
                "features": {
                    "event_kind_id": EVENT_KIND_FIRE_ID,
                    "first_order_feature_id": FIRST_HOUSE_ID,
                    "second_order_feature_id": SECOND_APARTMENT_ID,
                },
            },
            "required_actions": [{"action_type": "CARD_FEATURES_UPDATED"}],
        },
    }


async def test_individual_scenario_is_idempotent_isolated_and_evaluated(
    client: AsyncClient, database: Database
) -> None:
    template_response = await client.post("/api/v1/card-templates", json=template_payload())
    assert template_response.status_code == 201, template_response.text
    template_id = template_response.json()["id"]

    scenario_response = await client.post(
        "/api/v1/training-scenarios",
        json={
            "name": "Одиночная проверка",
            "difficulty": 2,
            "estimated_duration_seconds": 600,
            "workspace_mode": "INDIVIDUAL",
            "min_participants": 1,
            "max_participants": 1,
            "status": "PUBLISHED",
            "created_by": str(TEACHER_ID),
            "definition": {
                "schema_version": 1,
                "cards": [
                    {
                        "key": "fire-001",
                        "trigger_type": "TIME_OFFSET",
                        "trigger_config": {"offset_seconds": 0},
                        "source_type": "TEMPLATE",
                        "template_id": template_id,
                    },
                    {
                        "key": "police-followup",
                        "trigger_type": "AFTER_ACTION",
                        "trigger_config": {
                            "card_key": "fire-001",
                            "action_type": "CARD_FEATURES_UPDATED",
                            "delay_seconds": 0,
                        },
                        "source_type": "INLINE",
                        "initial_card": {
                            "event_type_id": EVENT_TYPE_102_ID,
                            "description": "Контрольная карточка после обработки пожара",
                        },
                        "expected_result": {
                            "final_state": {"event_type_id": EVENT_TYPE_102_ID},
                            "required_actions": [],
                        },
                    }
                ],
            },
        },
    )
    assert scenario_response.status_code == 201, scenario_response.text
    assert scenario_response.json()["cards_count"] == 2

    assignment_response = await client.post(
        "/api/v1/scenario-assignments",
        json={
            "scenario_id": scenario_response.json()["id"],
            "participant_ids": [str(STUDENT_ID)],
            "assigned_by": str(TEACHER_ID),
            "launch_policy": "STUDENT_SELF_START",
        },
    )
    assert assignment_response.status_code == 201, assignment_response.text
    assignment_id = assignment_response.json()["id"]

    start_headers = {"Idempotency-Key": "attempt-1"}
    started = await client.post(
        f"/api/v1/scenario-assignments/{assignment_id}/start",
        json={"user_id": str(STUDENT_ID)},
        headers=start_headers,
    )
    assert started.status_code == 200, started.text
    started_data = started.json()
    assert started_data["idempotent_replay"] is False

    replay = await client.post(
        f"/api/v1/scenario-assignments/{assignment_id}/start",
        json={"user_id": str(STUDENT_ID)},
        headers=start_headers,
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["session_id"] == started_data["session_id"]
    assert replay.json()["idempotent_replay"] is True

    conflicting_start = await client.post(
        f"/api/v1/scenario-assignments/{assignment_id}/start",
        json={"user_id": str(STUDENT_ID)},
        headers={"Idempotency-Key": "attempt-2"},
    )
    assert conflicting_start.status_code == 409

    worker = ScenarioSchedulerWorker(database, "card.events")
    assert await worker.run_once() == 1

    schedule = await client.get(
        f"/api/v1/training-sessions/{started_data['session_id']}/scheduled-cards"
    )
    assert schedule.status_code == 200
    scheduled_card = next(
        item for item in schedule.json() if item["scenario_card_key"] == "fire-001"
    )
    assert scheduled_card["status"] == "EMITTED"
    card_id = scheduled_card["incident_card_id"]

    cards = await client.get(
        f"/api/v1/workspaces/{started_data['workspace_id']}/cards",
        headers={"X-User-Id": str(STUDENT_ID)},
    )
    assert cards.status_code == 200
    assert [card["card_id"] for card in cards.json()] == [card_id]

    denied = await client.get(
        f"/api/v1/workspaces/{started_data['workspace_id']}/cards",
        headers={"X-User-Id": str(uuid.uuid4())},
    )
    assert denied.status_code == 403

    card = await client.get(f"/api/v1/cards/{card_id}")
    rejected_update = await client.put(
        f"/api/v1/cards/{card_id}/features",
        json={
            "expected_card_version": 999,
            "actor_id": str(STUDENT_ID),
            "request_id": "features-rejected",
            "event_kind_id": EVENT_KIND_FIRE_ID,
        },
    )
    assert rejected_update.status_code == 409
    assert await worker.run_once() == 0

    update = await client.put(
        f"/api/v1/cards/{card_id}/features",
        json={
            "expected_card_version": card.json()["version"],
            "actor_id": str(STUDENT_ID),
            "request_id": "features-1",
            "event_kind_id": EVENT_KIND_FIRE_ID,
            "first_order_feature_id": FIRST_HOUSE_ID,
            "second_order_feature_id": SECOND_APARTMENT_ID,
            "additional_features": {"fire_manifestation": "OPEN_FLAME_SMOKE"},
        },
    )
    assert update.status_code == 200, update.text
    assert await worker.run_once() == 1

    cards = await client.get(
        f"/api/v1/workspaces/{started_data['workspace_id']}/cards",
        headers={"X-User-Id": str(STUDENT_ID)},
    )
    assert cards.status_code == 200
    assert len(cards.json()) == 2

    completed = await client.post(
        f"/api/v1/training-sessions/{started_data['session_id']}/complete",
        json={"user_id": str(STUDENT_ID)},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["status"] == "COMPLETED"
    assert completed.json()["passed"] is True
    assert float(completed.json()["score"]) == 100.0

    actions = await client.get(
        f"/api/v1/training-sessions/{started_data['session_id']}/actions"
    )
    assert actions.status_code == 200
    assert [item["action_type"] for item in actions.json()] == [
        "SESSION_STARTED",
        "CARD_RELEASED",
        "CARD_FEATURES_UPDATED",
        "CARD_FEATURES_UPDATED",
        "CARD_RELEASED",
        "SESSION_COMPLETED",
    ]
    assert [item["result"] for item in actions.json()] == [
        "SUCCESS",
        "SUCCESS",
        "REJECTED",
        "SUCCESS",
        "SUCCESS",
        "SUCCESS",
    ]


async def test_expected_result_rejects_forbidden_actions(client: AsyncClient) -> None:
    payload = template_payload()
    payload["expected_result"]["forbidden_actions"] = [
        {"action_type": "CARD_STATUS_CHANGED"}
    ]

    response = await client.post("/api/v1/card-templates", json=payload)

    assert response.status_code == 422
