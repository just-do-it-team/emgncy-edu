"""End-to-end check against a running server and its realtime gateway.

The script selects an existing published individual scenario, assigns it to a
student, starts the assignment and handles every scenario card. New cards and
subsequent changes are observed through SSE. A card is fetched once after its
``card.created`` event because the current realtime contract contains deltas,
not a complete card snapshot. Completion readiness and the final completion
event are also verified through SSE. Both ``STUDENT_CONFIRM`` and
``AUTO_WHEN_READY`` individual scenarios are supported.

The created assignment and training session are intentionally retained for
inspection. Run from ``backend`` with ``python tests/live_scenario_check.py``.
"""

from __future__ import annotations

import json
import queue
import threading
import time
import uuid
from collections.abc import Callable
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


# Replace only this value when checking another server.
SERVER_ADDRESS = "http://192.168.1.10"

CARD_API_URL = f"{SERVER_ADDRESS.rstrip('/')}:8080"
REALTIME_GATEWAY_URL = f"{SERVER_ADDRESS.rstrip('/')}:8081"
ADMIN_API_URL = f"{SERVER_ADDRESS.rstrip('/')}:8082"

TEACHER_USERNAME = "yWJJ9_z"
STUDENT_USERNAME = "yWJJ9_y"
SERVICE_CODE = "101"

REQUEST_TIMEOUT_SECONDS = 15
SSE_CONNECT_TIMEOUT_SECONDS = 15
SSE_READ_TIMEOUT_SECONDS = 45
CARD_EVENT_TIMEOUT_SECONDS = 300
REPLICA_SYNC_TIMEOUT_SECONDS = 10
MAX_SUPPORTED_TRIGGER_DELAY_SECONDS = 300

SUPPORTED_ACTIONS = {
    "CARD_OPENED",
    "CARD_ACCEPTED",
    "CARD_REJECTED",
    "CARD_UPDATED",
    "CARD_FEATURES_UPDATED",
}
MUTABLE_CARD_FIELDS = {
    "description",
    "questionnaire",
    "reported_address",
    "incident_address",
    "victims_count",
}
SUPPORTED_FINAL_STATE_FIELDS = MUTABLE_CARD_FIELDS | {
    "event_type_id",
    "current_status",
    "features",
    "services",
    "service_statuses",
}


class LiveCheckError(RuntimeError):
    pass


def request_json(
    base_url: str,
    method: str,
    path: str,
    *,
    payload: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    expected_statuses: tuple[int, ...] = (200,),
) -> Any:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request_headers = {"Accept": "application/json", **(headers or {})}
    if data is not None:
        request_headers["Content-Type"] = "application/json"
    request = Request(
        f"{base_url}{path}",
        data=data,
        headers=request_headers,
        method=method,
    )
    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8")
            status = response.status
    except HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise LiveCheckError(f"{method} {path}: HTTP {error.code}: {body}") from error
    except URLError as error:
        raise LiveCheckError(f"{method} {path}: server is unavailable: {error.reason}") from error

    if status not in expected_statuses:
        raise LiveCheckError(f"{method} {path}: expected {expected_statuses}, got {status}: {body}")
    return json.loads(body) if body else None


def require(condition: bool, message: str) -> None:
    if not condition:
        raise LiveCheckError(message)


def print_stage(title: str) -> None:
    print(f"\n{'=' * 78}\n{title}\n{'=' * 78}")


def print_request(
    method: str,
    path: str,
    *,
    data: dict[str, Any] | None = None,
    actor: str | None = None,
) -> None:
    print(f"  Запрос: {method} {path}")
    if actor:
        print(f"  От имени: {actor}")
    if data is not None:
        print(f"  Данные: {json.dumps(data, ensure_ascii=False)}")


def print_json(title: str, value: Any) -> None:
    print(f"  {title}:")
    print(json.dumps(value, ensure_ascii=False, indent=2))


def event_workspace_id(event: dict[str, Any]) -> str:
    return str(event.get("workspace_id") or event.get("data", {}).get("workspace_id") or "")


class RealtimeEventStream:
    """Background SSE reader with a backlog for out-of-order matching."""

    def __init__(self, url: str) -> None:
        self.url = url
        self._queue: queue.Queue[dict[str, Any] | BaseException] = queue.Queue()
        self._backlog: list[dict[str, Any]] = []
        self._ready = threading.Event()
        self._stopping = threading.Event()
        self._response: Any = None
        self._connect_error: BaseException | None = None
        self._thread = threading.Thread(
            target=self._read_forever,
            name="live-check-sse",
            daemon=True,
        )

    def __enter__(self) -> "RealtimeEventStream":
        print_request("GET", "/events", data={"transport": "SSE", "filter": "client-side"})
        self._thread.start()
        if not self._ready.wait(SSE_CONNECT_TIMEOUT_SECONDS):
            raise LiveCheckError("Realtime gateway did not establish an SSE connection")
        if self._connect_error is not None:
            raise LiveCheckError(f"Realtime gateway connection failed: {self._connect_error}")
        # Let the server register the subscription after yielding its retry frame.
        time.sleep(0.25)
        print("  SSE-соединение установлено до запуска сценария")
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def close(self) -> None:
        self._stopping.set()
        if self._response is not None:
            try:
                self._response.close()
            except OSError:
                pass
        self._thread.join(timeout=2)

    def wait_for(
        self,
        predicate: Callable[[dict[str, Any]], bool],
        *,
        timeout: float,
        description: str,
    ) -> dict[str, Any]:
        for index, event in enumerate(self._backlog):
            self._raise_on_gap(event)
            if predicate(event):
                return self._backlog.pop(index)

        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise LiveCheckError(f"Realtime timeout while waiting for {description}")
            try:
                item = self._queue.get(timeout=remaining)
            except queue.Empty as error:
                raise LiveCheckError(
                    f"Realtime timeout while waiting for {description}"
                ) from error
            if isinstance(item, BaseException):
                raise LiveCheckError(f"Realtime stream failed: {item}") from item
            self._raise_on_gap(item)
            if predicate(item):
                return item
            self._backlog.append(item)
            if len(self._backlog) > 1000:
                self._backlog.pop(0)

    @staticmethod
    def _raise_on_gap(event: dict[str, Any]) -> None:
        if event.get("event_type") == "stream.gap":
            raise LiveCheckError(
                "Realtime gateway reported a stream gap; a REST resynchronization is required"
            )

    def _read_forever(self) -> None:
        request = Request(self.url, headers={"Accept": "text/event-stream"}, method="GET")
        try:
            with urlopen(request, timeout=SSE_READ_TIMEOUT_SECONDS) as response:
                self._response = response
                self._ready.set()
                data_lines: list[str] = []
                for raw_line in response:
                    if self._stopping.is_set():
                        return
                    line = raw_line.decode("utf-8").rstrip("\r\n")
                    if not line:
                        if not data_lines:
                            continue
                        payload = json.loads("\n".join(data_lines))
                        data_lines = []
                        self._queue.put(payload)
                        continue
                    if line.startswith("data:"):
                        data_lines.append(line[5:].lstrip())
        except BaseException as error:
            if not self._stopping.is_set():
                self._connect_error = error
                self._queue.put(error)
        finally:
            self._ready.set()


def wait_for_realtime_event(
    stream: RealtimeEventStream,
    *,
    event_type: str,
    workspace_id: str,
    card_id: str | None = None,
    timeout: float = CARD_EVENT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    print(
        f"  Realtime: ожидаем {event_type}"
        + (f" для card_id={card_id}" if card_id else "")
    )
    event = stream.wait_for(
        lambda value: (
            value.get("event_type") == event_type
            and event_workspace_id(value) == workspace_id
            and (card_id is None or str(value.get("aggregate_id")) == card_id)
        ),
        timeout=timeout,
        description=f"{event_type} in workspace {workspace_id}",
    )
    print_json("Получено через realtime gateway", event)
    return event


def find_user(username: str, expected_role: str) -> dict[str, Any]:
    query = urlencode({"search": username})
    path = f"/api/v1/admin/users?{query}"
    print_request("GET", path, data={"search": username, "expected_role": expected_role})
    page = request_json(ADMIN_API_URL, "GET", path)
    user = next(
        (item for item in page["items"] if item["username"].lower() == username.lower()),
        None,
    )
    require(user is not None, f"User {username!r} was not found")
    require(user["role"] == expected_role, f"User {username!r} has role {user['role']}")
    require(not user["is_blocked"], f"User {username!r} is blocked")
    print(f"  Найден: {user['display_name']} ({user['username']}), роль {user['role']}")
    return user


def find_service(code: str) -> dict[str, Any]:
    path = "/api/v1/services"
    print_request("GET", path, data={"ищем code": code})
    services = request_json(CARD_API_URL, "GET", path)
    service = next((item for item in services if item["code"] == code), None)
    require(service is not None, f"Emergency service {code!r} was not found")
    print(f"  Выбрана служба: {service['name']} (code={code}, id={service['id']})")
    return service


def resolve_scenario_templates(scenario: dict[str, Any]) -> dict[str, Any]:
    result = json.loads(json.dumps(scenario))
    for card in result["definition"]["cards"]:
        if card["source_type"] != "TEMPLATE":
            continue
        template_id = card["template_id"]
        path = f"/api/v1/card-templates/{template_id}"
        print_request("GET", path, data={"назначение": "проверка совместимости сценария"})
        template = request_json(CARD_API_URL, "GET", path)
        card["initial_card"] = template["initial_card"]
        card["expected_result"] = template["expected_result"]
        card["evaluation_rules"] = {
            **template.get("evaluation_rules", {}),
            **card.get("evaluation_rules", {}),
        }
    return result


def dict_contains(actual: dict[str, Any], expected: dict[str, Any]) -> bool:
    for key, value in expected.items():
        if key not in actual:
            return False
        if isinstance(value, dict):
            if not isinstance(actual[key], dict) or not dict_contains(actual[key], value):
                return False
        elif actual[key] != value:
            return False
    return True


def scenario_is_supported(scenario: dict[str, Any]) -> bool:
    if scenario["workspace_mode"] != "INDIVIDUAL":
        return False
    if scenario["min_participants"] != 1 or scenario["max_participants"] != 1:
        return False
    if scenario.get("completion_policy") not in {
        "STUDENT_CONFIRM",
        "AUTO_WHEN_READY",
    }:
        return False
    definition = scenario.get("definition", {})
    if definition.get("mode", "STATIC") != "STATIC":
        return False
    cards = definition.get("cards", [])
    if not cards or int(scenario["cards_count"]) != len(cards):
        return False

    for card in cards:
        if card.get("item_type", "INCIDENT_CARD") != "INCIDENT_CARD":
            return False
        if card.get("source_type") not in {"INLINE", "TEMPLATE"}:
            return False
        trigger_type = card["trigger_type"]
        trigger = card.get("trigger_config", {})
        if trigger_type == "TIME_OFFSET":
            if int(trigger.get("offset_seconds", 0)) > MAX_SUPPORTED_TRIGGER_DELAY_SECONDS:
                return False
        elif trigger_type == "AFTER_ACTION":
            if trigger.get("action_type") not in SUPPORTED_ACTIONS:
                return False
            if int(trigger.get("delay_seconds", 0)) > MAX_SUPPORTED_TRIGGER_DELAY_SECONDS:
                return False
        else:
            return False

        expected = card.get("expected_result", {})
        if expected.get("outbound_call") is not None or any(
            key in card.get("evaluation_rules", {})
            for key in ("outbound_call", "call_evaluation")
        ):
            return False
        required_actions = expected.get("required_actions", [])
        if any(item.get("action_type") not in SUPPORTED_ACTIONS for item in required_actions):
            return False
        if any(item.get("parameters") for item in required_actions):
            return False
        required_types = {item.get("action_type") for item in required_actions}
        if {"CARD_ACCEPTED", "CARD_REJECTED"} <= required_types:
            return False

        initial_card = card.get("initial_card", {})
        final_state = expected.get("card") or expected.get("final_state", {})
        if set(final_state) - SUPPORTED_FINAL_STATE_FIELDS:
            return False
        if (
            "event_type_id" in final_state
            and final_state["event_type_id"] != initial_card.get("event_type_id")
        ):
            return False
        if (
            "current_status" in final_state
            and final_state["current_status"] != "REGISTERED"
        ):
            return False
        if "features" in final_state:
            initial_features = initial_card.get("features")
            expected_features = final_state["features"]
            if expected_features is None:
                if initial_features is not None:
                    return False
            elif not isinstance(expected_features, dict) or not isinstance(
                expected_features.get("event_kind_id"), int
            ):
                return False

        if expected.get("card") is not None and final_state.get("services") != [SERVICE_CODE]:
            # This check adds the participant's service before opening the card.
            # A complete card reference expecting no service cannot pass it.
            return False
        questionnaire = final_state.get("questionnaire")
        if questionnaire is not None and (
            not isinstance(questionnaire, dict)
            or set(questionnaire) != {"questions", "answers"}
            or not all(isinstance(value, str) for value in questionnaire.values())
        ):
            return False

        expected_service_statuses = final_state.get("service_statuses", {})
        if not isinstance(expected_service_statuses, dict):
            return False
        if set(expected_service_statuses) - {SERVICE_CODE}:
            return False
        expected_service_status = expected_service_statuses.get(SERVICE_CODE)
        if expected_service_status not in {None, "ACCEPTED", "REJECTED"}:
            return False
        if (
            expected_service_status == "ACCEPTED"
            and "CARD_REJECTED" in required_types
        ) or (
            expected_service_status == "REJECTED"
            and "CARD_ACCEPTED" in required_types
        ):
            return False
    return True


def select_existing_scenario(teacher: dict[str, Any]) -> dict[str, Any]:
    path = "/api/v1/training-scenarios?status=PUBLISHED"
    print_request(
        "GET",
        path,
        data={"status": "PUBLISHED", "X-User-Id": teacher["id"]},
        actor=f"преподаватель {teacher['display_name']}",
    )
    scenarios = request_json(
        CARD_API_URL,
        "GET",
        path,
        headers={"X-User-Id": teacher["id"]},
    )
    require(scenarios, "The server has no published training scenarios")

    candidates: list[dict[str, Any]] = []
    for scenario in scenarios:
        definition = scenario.get("definition", {})
        cards = definition.get("cards", [])
        if (
            scenario["workspace_mode"] != "INDIVIDUAL"
            or definition.get("mode", "STATIC") != "STATIC"
            or not cards
            or any(card.get("item_type", "INCIDENT_CARD") != "INCIDENT_CARD" for card in cards)
        ):
            continue
        try:
            resolved = resolve_scenario_templates(scenario)
        except LiveCheckError as error:
            print(f"  Пропускаем сценарий {scenario['id']}: {error}")
            continue
        if scenario_is_supported(resolved):
            candidates.append(resolved)

    require(
        candidates,
        "No compatible published individual scenario was found. The live check supports "
        "STATIC incident-card scenarios with TIME_OFFSET and AFTER_ACTION triggers "
        "based on CARD_OPENED, "
        "CARD_ACCEPTED, CARD_REJECTED or CARD_UPDATED, and only final-state fields "
        "that it can reproduce safely.",
    )
    candidates.sort(
        key=lambda item: (
            -int(item["cards_count"]),
            int(item["estimated_duration_seconds"]),
            item["name"],
        )
    )
    scenario = candidates[0]
    print_json(
        "Выбран существующий сценарий",
        {
            "id": scenario["id"],
            "name": scenario["name"],
            "revision": scenario["revision"],
            "cards_count": scenario["cards_count"],
            "estimated_duration_seconds": scenario["estimated_duration_seconds"],
            "completion_policy": scenario["completion_policy"],
            "card_triggers": [
                {
                    "key": card["key"],
                    "trigger_type": card["trigger_type"],
                    "trigger_config": card.get("trigger_config", {}),
                }
                for card in scenario["definition"]["cards"]
            ],
        },
    )
    return scenario


def assign_scenario(
    scenario: dict[str, Any], teacher: dict[str, Any], student: dict[str, Any]
) -> dict[str, Any]:
    path = "/api/v1/scenario-assignments"
    payload = {
        "scenario_id": scenario["id"],
        "participant_ids": [student["id"]],
        "participant_positions": {student["id"]: SERVICE_CODE},
        "assigned_by": teacher["id"],
        "launch_policy": "STUDENT_SELF_START",
    }
    print_request(
        "POST",
        path,
        actor=f"преподаватель {teacher['display_name']}",
        data={
            "scenario_id": scenario["id"],
            "student_id": student["id"],
            "position_code": SERVICE_CODE,
            "launch_policy": "STUDENT_SELF_START",
        },
    )
    assignment = request_json(
        CARD_API_URL,
        "POST",
        path,
        payload=payload,
        expected_statuses=(201,),
    )
    require(
        assignment.get("participants", [{}])[0].get("position_code") == SERVICE_CODE,
        "Participant service was not saved",
    )
    print(f"  Назначение создано: id={assignment['id']}")
    return assignment


def find_assignment_as_student(
    assignment_id: str,
    scenario_id: str,
    student: dict[str, Any],
) -> dict[str, Any]:
    path = f"/api/v1/student/scenario-assignments/{assignment_id}"
    print_request(
        "GET",
        path,
        actor=f"обучаемый {student['display_name']}",
        data={"X-User-Id": student["id"]},
    )
    deadline = time.monotonic() + REPLICA_SYNC_TIMEOUT_SECONDS
    assignment: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        try:
            candidate = request_json(
                CARD_API_URL,
                "GET",
                path,
                headers={"X-User-Id": student["id"]},
            )
        except LiveCheckError:
            time.sleep(0.5)
            continue
        assignment = candidate if (
            candidate["id"] == assignment_id
            and candidate["scenario"]["id"] == scenario_id
        ) else None
        if assignment is not None:
            break
        time.sleep(0.5)
    require(assignment is not None, "Student did not receive the newly created assignment")
    print_json("Обучаемый нашёл назначенный сценарий", assignment)
    return assignment


def start_assignment(
    assignment: dict[str, Any], student: dict[str, Any], run_id: str
) -> dict[str, Any]:
    path = f"/api/v1/scenario-assignments/{assignment['id']}/start"
    payload = {"user_id": student["id"]}
    idempotency_key = f"live-existing-{run_id}"
    print_request(
        "POST",
        path,
        actor=f"обучаемый {student['display_name']}",
        data={**payload, "Idempotency-Key": idempotency_key},
    )
    started = request_json(
        CARD_API_URL,
        "POST",
        path,
        headers={"Idempotency-Key": idempotency_key},
        payload=payload,
    )
    print_json("Учебная сессия запущена", started)
    return started


def release_manual_cards(
    scenario: dict[str, Any],
    session_id: str,
    teacher: dict[str, Any],
) -> None:
    for card in scenario["definition"]["cards"]:
        if card["trigger_type"] != "MANUAL":
            continue
        path = (
            f"/api/v1/training-sessions/{session_id}/scheduled-cards/"
            f"{card['key']}/release"
        )
        payload = {"user_id": teacher["id"]}
        print_request(
            "POST",
            path,
            actor=f"преподаватель {teacher['display_name']}",
            data=payload,
        )
        released = request_json(CARD_API_URL, "POST", path, payload=payload)
        print(f"  Ручная карточка {card['key']} выпущена: status={released['status']}")


def scheduled_card_key(session_id: str, card_id: str) -> str:
    path = f"/api/v1/training-sessions/{session_id}/scheduled-cards"
    print_request(
        "GET",
        path,
        data={"назначение": f"сопоставить realtime card_id={card_id} с ключом сценария"},
    )
    deadline = time.monotonic() + REPLICA_SYNC_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        schedule = request_json(CARD_API_URL, "GET", path)
        item = next((value for value in schedule if value["incident_card_id"] == card_id), None)
        if item is not None:
            print(f"  card_id={card_id} соответствует scenario_card_key={item['scenario_card_key']}")
            return item["scenario_card_key"]
        time.sleep(0.5)
    raise LiveCheckError(f"Scheduled card metadata for card_id={card_id} was not found")


def replace_service(card: dict[str, Any], service: dict[str, Any]) -> None:
    services = card.setdefault("services", [])
    for index, existing in enumerate(services):
        if existing["id"] == service["id"]:
            services[index] = service
            return
    services.append(service)


def ensure_service_route(
    card_id: str,
    card_created_event: dict[str, Any],
    teacher: dict[str, Any],
    service: dict[str, Any],
    workspace_id: str,
    stream: RealtimeEventStream,
    run_id: str,
) -> dict[str, Any]:
    path = f"/api/v1/cards/{card_id}"
    print_request(
        "GET",
        path,
        data={"назначение": "однократная гидратация после realtime card.created"},
    )
    deadline = time.monotonic() + REPLICA_SYNC_TIMEOUT_SECONDS
    card: dict[str, Any] | None = None
    last_error: LiveCheckError | None = None
    while time.monotonic() < deadline:
        try:
            card = request_json(CARD_API_URL, "GET", path)
        except LiveCheckError as error:
            last_error = error
            time.sleep(0.5)
            continue
        break
    if card is None:
        suffix = f": {last_error}" if last_error else ""
        raise LiveCheckError(f"Card {card_id} did not appear on the read replica{suffix}")
    routed = next(
        (
            item
            for item in card["services"]
            if item["service_id"] == service["id"] and item["is_active"]
        ),
        None,
    )
    if routed is not None:
        print(f"  Карточка автоматически направлена службе {SERVICE_CODE}")
        return card

    add_path = f"/api/v1/cards/{card_id}/services"
    payload = {
        "service_id": service["id"],
        "expected_card_version": card["version"],
        "actor_id": teacher["id"],
        "request_id": f"live-{run_id}-{card_id}-route",
    }
    print_request(
        "POST",
        add_path,
        actor=f"преподаватель {teacher['display_name']}",
        data={
            "service_id": service["id"],
            "service_code": SERVICE_CODE,
            "expected_card_version": card["version"],
        },
    )
    added = request_json(
        CARD_API_URL,
        "POST",
        add_path,
        payload=payload,
        expected_statuses=(201,),
    )
    event = wait_for_realtime_event(
        stream,
        event_type="card.service.added",
        workspace_id=workspace_id,
        card_id=card_id,
    )
    replace_service(card, added)
    card["version"] = int(event.get("aggregate_version", card_created_event["aggregate_version"]))
    return card


def action_decision(card_definition: dict[str, Any]) -> str:
    expected = card_definition.get("expected_result", {})
    required = {
        item.get("action_type") for item in expected.get("required_actions", [])
    }
    service_status = (
        (expected.get("card") or expected.get("final_state", {}))
        .get("service_statuses", {})
        .get(SERVICE_CODE)
    )
    if "CARD_REJECTED" in required or service_status == "REJECTED":
        return "REJECTED"
    return "ACCEPTED"


def update_payload(
    card: dict[str, Any], card_definition: dict[str, Any], student_id: str, run_id: str
) -> dict[str, Any]:
    expected = card_definition.get("expected_result", {})
    expected_state = expected.get("card") or expected.get("final_state", {})
    values = {
        key: value
        for key, value in expected_state.items()
        if key in MUTABLE_CARD_FIELDS
    }
    if not values:
        # Produces CARD_UPDATED for AFTER_ACTION and evaluation without changing semantics.
        values["description"] = card.get("description", "")
    return {
        "expected_version": card["version"],
        **values,
        "actor_id": student_id,
        "request_id": f"live-{run_id}-{card['id']}-update",
    }


def update_features_if_expected(
    card: dict[str, Any],
    card_definition: dict[str, Any],
    student: dict[str, Any],
    workspace_id: str,
    stream: RealtimeEventStream,
    run_id: str,
) -> None:
    expected = card_definition.get("expected_result", {})
    expected_state = expected.get("card") or expected.get("final_state", {})
    features = expected_state.get("features")
    if not isinstance(features, dict):
        return
    card_id = str(card["id"])
    path = f"/api/v1/cards/{card_id}/features"
    payload = {
        "event_kind_id": features["event_kind_id"],
        "first_order_feature_id": features.get("first_order_feature_id"),
        "second_order_feature_id": features.get("second_order_feature_id"),
        "third_order_feature_id": features.get("third_order_feature_id"),
        "additional_features": features.get("additional_features", {}),
        "expected_card_version": card["version"],
        "actor_id": student["id"],
        "request_id": f"live-{run_id}-{card_id}-features",
    }
    print_request(
        "PUT",
        path,
        actor=f"обучаемый {student['display_name']}",
        data={key: value for key, value in payload.items() if key not in {"actor_id", "request_id"}},
    )
    updated = request_json(CARD_API_URL, "PUT", path, payload=payload)
    event = wait_for_realtime_event(
        stream,
        event_type="card.features.updated",
        workspace_id=workspace_id,
        card_id=card_id,
    )
    card["features"] = updated
    card["version"] = int(event["aggregate_version"])
    print_json("Признаки карточки после классификации", updated)


def process_card(
    *,
    card_created_event: dict[str, Any],
    card_definition: dict[str, Any],
    workspace_id: str,
    teacher: dict[str, Any],
    student: dict[str, Any],
    service: dict[str, Any],
    stream: RealtimeEventStream,
    run_id: str,
) -> None:
    card_id = str(card_created_event["aggregate_id"])
    card = ensure_service_route(
        card_id,
        card_created_event,
        teacher,
        service,
        workspace_id,
        stream,
        run_id,
    )
    print_json("Что видит обучаемый после поступления карточки", card)

    open_path = f"/api/v1/workspaces/{workspace_id}/cards/{card_id}/open"
    print_request(
        "POST",
        open_path,
        actor=f"обучаемый {student['display_name']}",
        data={"X-User-Id": student["id"]},
    )
    opened = request_json(
        CARD_API_URL,
        "POST",
        open_path,
        headers={"X-User-Id": student["id"]},
    )
    opened_event = wait_for_realtime_event(
        stream,
        event_type="card.service.opened",
        workspace_id=workspace_id,
        card_id=card_id,
    )
    require(opened["open_deadline_missed_at"] is None, f"Card {card_id} was opened late")
    replace_service(card, opened)
    card["version"] = int(opened_event["aggregate_version"])
    print_json("Состояние обучаемого после открытия", card)

    update_path = f"/api/v1/cards/{card_id}"
    payload = update_payload(card, card_definition, student["id"], run_id)
    visible_payload = {
        key: value
        for key, value in payload.items()
        if key not in {"actor_id", "request_id"}
    }
    print_request(
        "PATCH",
        update_path,
        actor=f"обучаемый {student['display_name']}",
        data=visible_payload,
    )
    card = request_json(CARD_API_URL, "PATCH", update_path, payload=payload)
    update_event = wait_for_realtime_event(
        stream,
        event_type="card.updated",
        workspace_id=workspace_id,
        card_id=card_id,
    )
    card["version"] = int(update_event["aggregate_version"])
    print_json("Состояние обучаемого после заполнения карточки", card)

    update_features_if_expected(
        card,
        card_definition,
        student,
        workspace_id,
        stream,
        run_id,
    )

    # Решение службы является финальным пользовательским действием по карточке.
    # Это особенно важно для AUTO_WHEN_READY: после него backend уже может
    # автоматически завершить сессию.
    decision = action_decision(card_definition)
    decision_path = f"/api/v1/workspaces/{workspace_id}/cards/{card_id}/decision"
    decision_payload = {
        "decision": decision,
        "comment": "Учебный отказ" if decision == "REJECTED" else None,
        "request_id": f"live-{run_id}-{card_id}-decision",
    }
    print_request(
        "POST",
        decision_path,
        actor=f"обучаемый {student['display_name']}",
        data={"decision": decision, "X-User-Id": student["id"]},
    )
    decided = request_json(
        CARD_API_URL,
        "POST",
        decision_path,
        headers={"X-User-Id": student["id"]},
        payload=decision_payload,
    )
    decision_event = wait_for_realtime_event(
        stream,
        event_type="card.service.decision",
        workspace_id=workspace_id,
        card_id=card_id,
    )
    require(
        decided["decision_deadline_missed_at"] is None,
        f"Decision for card {card_id} was late",
    )
    replace_service(card, decided)
    card["version"] = int(decision_event["aggregate_version"])
    print_json(f"Итоговое состояние карточки после решения {decision}", card)


def wait_until_completion_ready(
    stream: RealtimeEventStream,
    workspace_id: str,
    session_id: str,
    student: dict[str, Any],
    expected_count: int,
    completion_policy: str,
) -> dict[str, Any]:
    print("  Realtime: ожидаем can_complete=true для учебной сессии")
    event = stream.wait_for(
        lambda value: (
            value.get("event_type")
            == "training.session.completion-readiness-changed"
            and event_workspace_id(value) == workspace_id
            and str(value.get("aggregate_id")) == session_id
            and value.get("data", {}).get("can_complete") is True
        ),
        timeout=CARD_EVENT_TIMEOUT_SECONDS,
        description=f"completion readiness for training session {session_id}",
    )
    print_json("Realtime сообщил о готовности завершения", event)
    event_readiness = event["data"]
    require(
        event_readiness["cards_total"] == expected_count,
        "Realtime readiness has an unexpected scenario card count",
    )
    require(event_readiness["cards_pending"] == 0, "Scenario still has pending cards")
    require(event_readiness["cards_failed"] == 0, "Scenario has failed cards")
    require(
        not event_readiness["blockers"],
        f"Realtime completion is blocked: {event_readiness['blockers']}",
    )

    path = f"/api/v1/training-sessions/{session_id}/completion-readiness"
    print_request(
        "GET",
        path,
        actor=f"обучаемый {student['display_name']}",
        data={"X-User-Id": student["id"]},
    )
    readiness = request_json(
        CARD_API_URL,
        "GET",
        path,
        headers={"X-User-Id": student["id"]},
    )
    print_json("Что видит обучаемый в состоянии завершения", readiness)
    require(
        readiness["cards_total"] == expected_count,
        "Completion state has an unexpected scenario card count",
    )
    require(readiness["cards_pending"] == 0, "Scenario still has pending cards")
    require(readiness["cards_failed"] == 0, "Scenario has failed cards")
    if readiness["status"] == "RUNNING":
        require(readiness["can_complete"] is True, "Server does not allow completion")
        require(
            not readiness["blockers"],
            f"Completion is blocked: {readiness['blockers']}",
        )
    else:
        require(
            completion_policy == "AUTO_WHEN_READY"
            and readiness["status"] == "COMPLETED",
            f"Session unexpectedly changed to status {readiness['status']}",
        )
        print("  AUTO_WHEN_READY уже завершил сессию после readiness-события")
    return readiness


def complete_session(
    session_id: str,
    workspace_id: str,
    student: dict[str, Any],
    stream: RealtimeEventStream,
) -> dict[str, Any]:
    path = f"/api/v1/training-sessions/{session_id}/complete"
    payload = {"user_id": student["id"]}
    print_request(
        "POST",
        path,
        actor=f"обучаемый {student['display_name']}",
        data=payload,
    )
    result = request_json(CARD_API_URL, "POST", path, payload=payload)
    print_json("Итог сценария", result)
    require(result["status"] == "COMPLETED", "Training session was not completed")
    require(result["passed"] is True, f"Scenario evaluation failed: {result['result']}")
    completed_event = wait_for_realtime_event(
        stream,
        event_type="training.session_completed",
        workspace_id=workspace_id,
        card_id=session_id,
    )
    require(
        completed_event.get("data", {}).get("completed_automatically") is False,
        "STUDENT_CONFIRM session was marked as automatically completed",
    )
    return result


def load_completed_session(session_id: str) -> dict[str, Any]:
    path = f"/api/v1/training-sessions/{session_id}"
    print_request(
        "GET",
        path,
        data={"назначение": "получить полный результат после AUTO_WHEN_READY"},
    )
    deadline = time.monotonic() + REPLICA_SYNC_TIMEOUT_SECONDS
    last_result: dict[str, Any] | None = None
    last_error: LiveCheckError | None = None
    while time.monotonic() < deadline:
        try:
            last_result = request_json(CARD_API_URL, "GET", path)
        except LiveCheckError as error:
            last_error = error
            time.sleep(0.5)
            continue
        if last_result["status"] == "COMPLETED":
            print_json("Полный итог автоматически завершённого сценария", last_result)
            return last_result
        time.sleep(0.5)
    suffix = f": {last_error}" if last_error else f": last status={last_result}"
    raise LiveCheckError(f"Completed session did not appear on the read replica{suffix}")


def wait_for_automatic_completion(
    stream: RealtimeEventStream,
    workspace_id: str,
    session_id: str,
) -> dict[str, Any]:
    event = wait_for_realtime_event(
        stream,
        event_type="training.session_completed",
        workspace_id=workspace_id,
        card_id=session_id,
    )
    require(
        event.get("data", {}).get("completed_automatically") is True,
        "AUTO_WHEN_READY session was not completed automatically",
    )
    require(event.get("data", {}).get("passed") is True, f"Scenario failed: {event}")
    print_json("Realtime-итог автоматически завершённого сценария", event["data"])
    result = load_completed_session(session_id)
    require(result["completed_automatically"] is True, "Session completion mode is incorrect")
    require(result["passed"] is True, f"Scenario evaluation failed: {result['result']}")
    return result


def verify_server_contract() -> None:
    openapi = request_json(CARD_API_URL, "GET", "/openapi.json")
    paths = openapi.get("paths", {})
    required_paths = {
        "/api/v1/training-scenarios",
        "/api/v1/scenario-assignments",
        "/api/v1/student/scenario-assignments/{assignment_id}",
        "/api/v1/scenario-assignments/{assignment_id}/start",
        "/api/v1/workspaces/{workspace_id}/cards/{card_id}/open",
        "/api/v1/workspaces/{workspace_id}/cards/{card_id}/decision",
        "/api/v1/training-sessions/{session_id}/completion-readiness",
        "/api/v1/training-sessions/{session_id}/complete",
        "/api/v1/training-sessions/{session_id}",
    }
    missing = sorted(required_paths - set(paths))
    require(not missing, f"Card API contract is outdated; missing paths: {missing}")

    realtime_openapi = request_json(REALTIME_GATEWAY_URL, "GET", "/openapi.json")
    require(
        "/events" in realtime_openapi.get("paths", {}),
        "Realtime gateway does not expose /events",
    )


def main() -> None:
    print_stage(f"Подготовка проверки сервера {SERVER_ADDRESS}")
    for base_url, service_name in (
        (CARD_API_URL, "card-api"),
        (REALTIME_GATEWAY_URL, "realtime-gateway"),
        (ADMIN_API_URL, "admin-api"),
    ):
        print_request("GET", "/health", data={"service": service_name})
        health = request_json(base_url, "GET", "/health")
        if service_name == "admin-api":
            require(
                health.get("dependencies", {}).get("database") == "ok",
                f"Admin API cannot access the database: {health}",
            )
        else:
            require(health["status"] == "ok", f"{service_name} is unhealthy: {health}")
    verify_server_contract()
    print("  Все API доступны, realtime contract найден")

    print_stage("Поиск участников, службы и существующего сценария")
    teacher = find_user(TEACHER_USERNAME, "TEACHER")
    student = find_user(STUDENT_USERNAME, "STUDENT")
    service = find_service(SERVICE_CODE)
    scenario = select_existing_scenario(teacher)
    card_definitions = {
        card["key"]: card for card in scenario["definition"]["cards"]
    }

    print_stage("Преподаватель назначает выбранный сценарий")
    assignment = assign_scenario(scenario, teacher, student)

    print_stage("Обучаемый запрашивает свои назначения")
    student_assignment = find_assignment_as_student(
        assignment["id"], scenario["id"], student
    )
    run_id = uuid.uuid4().hex[:10]

    print_stage("Realtime gateway подключается до запуска сценария")
    with RealtimeEventStream(f"{REALTIME_GATEWAY_URL}/events") as stream:
        started = start_assignment(student_assignment, student, run_id)
        workspace_id = started["workspace_id"]
        session_id = started["session_id"]
        release_manual_cards(scenario, session_id, teacher)

        processed_card_ids: set[str] = set()
        expected_count = int(scenario["cards_count"])
        while len(processed_card_ids) < expected_count:
            print_stage(
                f"Ожидание карточки {len(processed_card_ids) + 1} из {expected_count} через realtime"
            )
            created = stream.wait_for(
                lambda event: (
                    event.get("event_type") == "card.created"
                    and event_workspace_id(event) == workspace_id
                    and str(event.get("aggregate_id")) not in processed_card_ids
                ),
                timeout=CARD_EVENT_TIMEOUT_SECONDS,
                description=f"next card.created in workspace {workspace_id}",
            )
            print_json("Новая карточка получена через realtime gateway", created)
            card_id = str(created["aggregate_id"])
            scenario_card_key = scheduled_card_key(session_id, card_id)
            definition = card_definitions.get(scenario_card_key)
            require(
                definition is not None,
                f"Scenario definition for key {scenario_card_key!r} was not found",
            )
            process_card(
                card_created_event=created,
                card_definition=definition,
                workspace_id=workspace_id,
                teacher=teacher,
                student=student,
                service=service,
                stream=stream,
                run_id=run_id,
            )
            processed_card_ids.add(card_id)
            if len(processed_card_ids) < expected_count:
                print(
                    f"  Обработано карточек: {len(processed_card_ids)} из {expected_count}. "
                    "Сценарий пока не завершается."
                )
            else:
                print(
                    f"  Обработаны все {expected_count} карточек. "
                    "Переходим к проверке готовности завершения."
                )

        print_stage("Проверка готовности сценария к завершению")
        wait_until_completion_ready(
            stream,
            workspace_id,
            session_id,
            student,
            expected_count,
            scenario["completion_policy"],
        )
        if scenario["completion_policy"] == "AUTO_WHEN_READY":
            print("  Политика AUTO_WHEN_READY: ожидаем автоматическое завершение")
            wait_for_automatic_completion(stream, workspace_id, session_id)
        else:
            print("  Политика STUDENT_CONFIRM: обучаемый подтверждает завершение")
            complete_session(session_id, workspace_id, student, stream)

    print_stage("Проверка завершена успешно")


if __name__ == "__main__":
    try:
        main()
    except (LiveCheckError, KeyError, TypeError, ValueError) as error:
        raise SystemExit(f"Проверка завершилась ошибкой: {error}") from error
