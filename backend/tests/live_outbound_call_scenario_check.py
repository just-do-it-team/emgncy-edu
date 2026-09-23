"""Live end-to-end check for a difficulty-2 outbound-call scenario.

The script uses an existing published scenario and runs it twice:

* a successful attempt with the expected outbound-call text;
* an unsuccessful attempt where one card has a minor wording imperfection and
  the other has a significant semantic error.

For every card the student opens and accepts it, starts the service response,
creates speech through the project TTS API, uploads the resulting WAV to the
STT API as an outbound call, waits for semantic evaluation through realtime,
and finishes the service work. Assignments and sessions are intentionally kept
for inspection.

Run from ``backend`` with::

    python tests/live_outbound_call_scenario_check.py
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import live_scenario_check as common


# Replace only this value when checking another server.
SERVER_ADDRESS = "http://192.168.1.10"

CARD_API_URL = f"{SERVER_ADDRESS.rstrip('/')}:8080"
REALTIME_GATEWAY_URL = f"{SERVER_ADDRESS.rstrip('/')}:8081"
ADMIN_API_URL = f"{SERVER_ADDRESS.rstrip('/')}:8082"

TEACHER_USERNAME = "yWJJ9_z"
STUDENT_USERNAME = "yWJJ9_y"
SERVICE_CODE = "101"

AUDIO_EVENT_TIMEOUT_SECONDS = 600
EXPECTED_CARDS_COUNT = 2

PRODUCED_ACTIONS = {
    "CARD_OPENED",
    "CARD_ACCEPTED",
    "CARD_UPDATED",
    "CARD_FEATURES_UPDATED",
    "SERVICE_STATUS_CHANGED",
    "AUDIO_MESSAGE_TRANSCRIBED",
    "OUTBOUND_CALL_EVALUATED",
    "RESPONSE_TEAM_LEADER_CALLED",
    "CARD_STATUS_CHANGED",
}
TRIGGER_ACTIONS = {
    "CARD_OPENED",
    "CARD_ACCEPTED",
    "CARD_UPDATED",
    "CARD_FEATURES_UPDATED",
    "SERVICE_STATUS_CHANGED",
}
SERVICE_WORKFLOW = (
    "RESPONSE_STARTED",
    "ARRIVED",
    "WORK_IN_PROGRESS",
    "WORK_COMPLETED",
)


def configure_common_helpers() -> None:
    """Point the shared live-check helpers at this script's server settings."""

    common.SERVER_ADDRESS = SERVER_ADDRESS
    common.CARD_API_URL = CARD_API_URL
    common.REALTIME_GATEWAY_URL = REALTIME_GATEWAY_URL
    common.ADMIN_API_URL = ADMIN_API_URL
    common.SERVICE_CODE = SERVICE_CODE


def request_bytes(
    base_url: str,
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    expected_statuses: tuple[int, ...] = (200,),
) -> tuple[bytes, str | None]:
    request = Request(
        f"{base_url}{path}",
        data=body,
        headers=headers or {},
        method=method,
    )
    try:
        with urlopen(request, timeout=common.REQUEST_TIMEOUT_SECONDS) as response:
            response_body = response.read()
            status = response.status
            content_type = response.headers.get("Content-Type")
    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        raise common.LiveCheckError(
            f"{method} {path}: HTTP {error.code}: {error_body}"
        ) from error
    except URLError as error:
        raise common.LiveCheckError(
            f"{method} {path}: server is unavailable: {error.reason}"
        ) from error

    if status not in expected_statuses:
        visible = response_body.decode("utf-8", errors="replace")
        raise common.LiveCheckError(
            f"{method} {path}: expected {expected_statuses}, got {status}: {visible}"
        )
    return response_body, content_type


def multipart_audio_body(audio: bytes) -> tuple[bytes, str]:
    boundary = f"----s112-live-{uuid.uuid4().hex}"
    chunks = [
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="direction"\r\n\r\n',
        b"OUTBOUND\r\n",
        f"--{boundary}\r\n".encode(),
        (
            b'Content-Disposition: form-data; name="audio"; '
            b'filename="outbound-call.wav"\r\n'
        ),
        b"Content-Type: audio/wav\r\n\r\n",
        audio,
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _parameters_are_supported(required: dict[str, Any]) -> bool:
    action_type = required.get("action_type")
    parameters = required.get("parameters") or {}
    if not isinstance(parameters, dict):
        return False
    if action_type == "SERVICE_STATUS_CHANGED":
        status = parameters.get("status")
        return status is None or status in SERVICE_WORKFLOW
    if action_type == "AUDIO_MESSAGE_TRANSCRIBED":
        direction = parameters.get("direction")
        return direction is None or direction == "OUTBOUND"
    if action_type == "OUTBOUND_CALL_EVALUATED":
        return set(parameters) <= {
            "passed",
            "minimum_similarity",
            "similarity",
            "expected_text",
            "actual_text",
        }
    if action_type in {"RESPONSE_TEAM_LEADER_CALLED", "CARD_STATUS_CHANGED"}:
        return True
    return action_type in {
        "CARD_OPENED", "CARD_ACCEPTED", "CARD_UPDATED", "CARD_FEATURES_UPDATED"
    }


def card_outbound_call_rule(card: dict[str, Any]) -> dict[str, Any] | None:
    expected_result = card.get("expected_result") or {}
    direct_result = expected_result.get("outbound_call")
    if isinstance(direct_result, dict):
        expected_text = direct_result.get("expected_text")
        if isinstance(expected_text, str) and expected_text.strip():
            return {
                "expected_text": expected_text.strip(),
                "spoken_text": expected_text.strip(),
                "minimum_similarity": float(direct_result.get("minimum_similarity", 0.8)),
            }

    evaluation_rules = card.get("evaluation_rules") or {}
    direct = evaluation_rules.get("outbound_call")
    if isinstance(direct, dict):
        expected_text = direct.get("expected_text")
        if isinstance(expected_text, str) and expected_text.strip():
            return {
                "expected_text": expected_text.strip(),
                "spoken_text": expected_text.strip(),
                "minimum_similarity": float(direct.get("minimum_similarity", 0.8)),
            }

    legacy = evaluation_rules.get("call_evaluation")
    if not isinstance(legacy, dict):
        return None
    for action in expected_result.get("required_actions", []):
        if action.get("action_type") != "RESPONSE_TEAM_LEADER_CALLED":
            continue
        transcript = (action.get("parameters") or {}).get("expected_transcript") or {}
        if not isinstance(transcript, dict):
            return None
        comparison_field = legacy.get("comparison_field", "required_facts")
        expected_text = transcript.get(comparison_field)
        if not isinstance(expected_text, str) or not expected_text.strip():
            expected_text = transcript.get("required_facts") or transcript.get(
                "reference_text"
            )
        if not isinstance(expected_text, str) or not expected_text.strip():
            return None
        reference_text = transcript.get("reference_text")
        spoken_text = (
            reference_text.strip()
            if isinstance(reference_text, str) and reference_text.strip()
            else expected_text.strip()
        )
        return {
            "expected_text": expected_text.strip(),
            "spoken_text": spoken_text,
            "minimum_similarity": float(legacy.get("minimum_similarity", 0.8)),
        }
    return None


def scenario_is_supported(scenario: dict[str, Any]) -> bool:
    if int(scenario.get("difficulty", 0)) != 2:
        return False
    if scenario.get("workspace_mode") != "INDIVIDUAL":
        return False
    if scenario.get("completion_policy") != "STUDENT_CONFIRM":
        return False
    if int(scenario.get("min_participants", 0)) != 1:
        return False
    if int(scenario.get("max_participants", 0)) != 1:
        return False

    definition = scenario.get("definition", {})
    if definition.get("mode", "STATIC") != "STATIC":
        return False
    cards = definition.get("cards", [])
    if len(cards) != EXPECTED_CARDS_COUNT:
        return False
    if int(scenario.get("cards_count", 0)) != len(cards):
        return False

    for card in cards:
        if card.get("item_type", "INCIDENT_CARD") != "INCIDENT_CARD":
            return False
        if card.get("source_type") not in {"INLINE", "TEMPLATE"}:
            return False
        trigger_type = card.get("trigger_type")
        trigger = card.get("trigger_config") or {}
        if trigger_type == "TIME_OFFSET":
            if int(trigger.get("offset_seconds", 0)) > common.MAX_SUPPORTED_TRIGGER_DELAY_SECONDS:
                return False
        elif trigger_type == "AFTER_ACTION":
            if trigger.get("action_type") not in TRIGGER_ACTIONS:
                return False
            if int(trigger.get("delay_seconds", 0)) > common.MAX_SUPPORTED_TRIGGER_DELAY_SECONDS:
                return False
        else:
            return False

        call_rule = card_outbound_call_rule(card)
        if call_rule is None:
            return False
        configured_service = (card.get("evaluation_rules") or {}).get(
            "operator_service_code"
        )
        if configured_service not in {None, SERVICE_CODE}:
            return False
        if not isinstance(call_rule.get("expected_text"), str):
            return False
        if not call_rule["expected_text"].strip():
            return False
        threshold = call_rule.get("minimum_similarity", 0.8)
        if isinstance(threshold, bool) or not isinstance(threshold, (int, float)):
            return False
        if not 0 <= float(threshold) <= 1:
            return False

        expected = card.get("expected_result") or {}
        required_actions = expected.get("required_actions") or []
        if any(item.get("action_type") not in PRODUCED_ACTIONS for item in required_actions):
            return False
        if any(not _parameters_are_supported(item) for item in required_actions):
            return False

        initial_card = card.get("initial_card") or {}
        final_state = expected.get("card") or expected.get("final_state") or {}
        if set(final_state) - common.SUPPORTED_FINAL_STATE_FIELDS:
            return False
        if (
            "event_type_id" in final_state
            and final_state["event_type_id"] != initial_card.get("event_type_id")
        ):
            return False
        if final_state.get("current_status", "REGISTERED") not in {
            "REGISTERED",
            "COMPLETED",
        }:
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
            return False
        questionnaire = final_state.get("questionnaire")
        if questionnaire is not None and (
            not isinstance(questionnaire, dict)
            or set(questionnaire) != {"questions", "answers"}
            or not all(isinstance(value, str) for value in questionnaire.values())
        ):
            return False

        service_statuses = final_state.get("service_statuses", {})
        if not isinstance(service_statuses, dict):
            return False
        if set(service_statuses) - {SERVICE_CODE}:
            return False
        if service_statuses.get(SERVICE_CODE) not in {None, "WORK_COMPLETED"}:
            return False
    return True


def select_outbound_call_scenario(teacher: dict[str, Any]) -> dict[str, Any]:
    path = "/api/v1/training-scenarios?status=PUBLISHED&difficulty=2"
    common.print_request(
        "GET",
        path,
        actor="преподаватель",
        data={
            "status": "PUBLISHED",
            "difficulty": 2,
            "X-User-Id": teacher["id"],
        },
    )
    scenarios = common.request_json(
        CARD_API_URL,
        "GET",
        path,
        headers={"X-User-Id": teacher["id"]},
    )
    candidates: list[dict[str, Any]] = []
    for scenario in scenarios:
        definition = scenario.get("definition", {})
        cards = definition.get("cards", [])
        if (
            definition.get("mode", "STATIC") != "STATIC"
            or len(cards) != EXPECTED_CARDS_COUNT
            or any(card.get("item_type", "INCIDENT_CARD") != "INCIDENT_CARD" for card in cards)
        ):
            continue
        try:
            resolved = common.resolve_scenario_templates(scenario)
        except common.LiveCheckError as error:
            print(f"  Пропускаем сценарий {scenario['id']}: {error}")
            continue
        if scenario_is_supported(resolved):
            candidates.append(resolved)

    common.require(
        candidates,
        "Не найден опубликованный индивидуальный сценарий сложности 2 с двумя "
        "карточками и эталоном исходящего звонка в expected_result или "
        "evaluation_rules, с политикой "
        "STUDENT_CONFIRM, который может воспроизвести live-тест.",
    )
    candidates.sort(key=lambda item: (item["name"], item["id"]))
    scenario = candidates[0]
    common.print_json(
        "Выбран существующий сценарий",
        {
            "id": scenario["id"],
            "name": scenario["name"],
            "difficulty": scenario["difficulty"],
            "cards": [
                {
                    "key": card["key"],
                    "trigger_type": card["trigger_type"],
                    "trigger_config": card.get("trigger_config", {}),
                    "outbound_call": card_outbound_call_rule(card),
                }
                for card in scenario["definition"]["cards"]
            ],
        },
    )
    return scenario


def load_initial_student_cards(workspace_id: str, student: dict[str, Any]) -> list[dict[str, Any]]:
    path = f"/api/v1/workspaces/{workspace_id}/cards?limit=100"
    common.print_request(
        "GET",
        path,
        actor=f"обучаемый {student['display_name']}",
        data={"X-User-Id": student["id"], "назначение": "первичные данные кейса"},
    )
    deadline = time.monotonic() + common.REPLICA_SYNC_TIMEOUT_SECONDS
    last_error: common.LiveCheckError | None = None
    while True:
        try:
            page = common.request_json(
                CARD_API_URL,
                "GET",
                path,
                headers={"X-User-Id": student["id"]},
            )
            cards = page["items"]
            break
        except common.LiveCheckError as error:
            last_error = error
            if time.monotonic() >= deadline:
                raise common.LiveCheckError(
                    "Первичные данные кейса не появились на read replica: "
                    f"{last_error}"
                ) from error
            time.sleep(0.5)
    common.print_json("Первичный список карточек, который видит обучаемый", cards)
    return cards


def load_student_card(
    workspace_id: str,
    card_id: str,
    student: dict[str, Any],
) -> dict[str, Any]:
    path = f"/api/v1/workspaces/{workspace_id}/cards/{card_id}"
    common.print_request(
        "GET",
        path,
        actor=f"обучаемый {student['display_name']}",
        data={"назначение": "гидратация realtime-события card.created"},
    )
    deadline = time.monotonic() + common.REPLICA_SYNC_TIMEOUT_SECONDS
    last_error: common.LiveCheckError | None = None
    while time.monotonic() < deadline:
        try:
            card = common.request_json(
                CARD_API_URL,
                "GET",
                path,
                headers={"X-User-Id": student["id"]},
            )
            common.print_json("Полная карточка, которую видит обучаемый", card)
            return card
        except common.LiveCheckError as error:
            last_error = error
            time.sleep(0.5)
    raise common.LiveCheckError(
        f"Карточка {card_id} не появилась у обучаемого на read replica: {last_error}"
    )


def make_call_text(expected_text: str, variant: str) -> str:
    if variant == "correct":
        return expected_text.strip()
    if variant == "minor":
        return (
            f"{expected_text.strip()} Повторяю: сообщение передано, "
            "в формулировке возможна небольшая речевая неточность."
        )
    if variant == "significant":
        return (
            "Учебное оповещение: обстановка спокойная, выезд бригады не требуется. "
            "Адрес и сведения о происшествии не подтверждены."
        )
    raise ValueError(f"Unknown call-text variant: {variant}")


def wait_for_audio_event(
    stream: common.RealtimeEventStream,
    *,
    event_types: set[str],
    workspace_id: str,
    audio_message_id: str,
    description: str,
) -> dict[str, Any]:
    expected_events = ", ".join(sorted(event_types))
    print(
        f"  Realtime: ожидаем {expected_events} "
        f"для audio_message_id={audio_message_id}"
    )
    event = stream.wait_for(
        lambda value: (
            value.get("event_type") in event_types
            and common.event_workspace_id(value) == workspace_id
            and str(value.get("aggregate_id")) == audio_message_id
        ),
        timeout=AUDIO_EVENT_TIMEOUT_SECONDS,
        description=description,
    )
    common.print_json("Получено через realtime gateway", event)
    return event


def run_outbound_call(
    *,
    workspace_id: str,
    card_id: str,
    expected_text: str,
    call_text: str,
    expected_passed: bool,
    student: dict[str, Any],
    stream: common.RealtimeEventStream,
    run_id: str,
) -> dict[str, Any]:
    print("  Обучаемый формирует исходящее голосовое оповещение")
    common.print_json(
        "Текст звонка",
        {
            "expected_text": expected_text,
            "spoken_text": call_text,
            "ожидаемый_результат_семантики": expected_passed,
        },
    )

    tts_path = f"/api/v1/workspaces/{workspace_id}/cards/{card_id}/tts-messages"
    tts_payload = {"text": call_text}
    tts_key = f"live-outbound-{run_id}-{card_id}-tts"
    common.print_request(
        "POST",
        tts_path,
        actor=f"обучаемый {student['display_name']}",
        data={"text": call_text, "Idempotency-Key": tts_key},
    )
    tts_message = common.request_json(
        CARD_API_URL,
        "POST",
        tts_path,
        headers={
            "X-User-Id": student["id"],
            "Idempotency-Key": tts_key,
        },
        payload=tts_payload,
        expected_statuses=(202,),
    )
    tts_id = str(tts_message["id"])
    tts_event = wait_for_audio_event(
        stream,
        event_types={"training.tts_completed", "training.audio_processing_failed"},
        workspace_id=workspace_id,
        audio_message_id=tts_id,
        description=f"TTS result for {tts_id}",
    )
    common.require(
        tts_event["event_type"] == "training.tts_completed",
        f"Генерация речи завершилась ошибкой: {tts_event}",
    )

    content_path = f"/api/v1/audio-messages/{tts_id}/content"
    common.print_request(
        "GET",
        content_path,
        actor=f"обучаемый {student['display_name']}",
        data={"назначение": "скачать сгенерированный WAV для тестового звонка"},
    )
    audio, content_type = request_bytes(
        CARD_API_URL,
        "GET",
        content_path,
        headers={"X-User-Id": student["id"]},
    )
    common.require(audio, "TTS API вернул пустой аудиофайл")
    print(f"  Получен WAV: {len(audio)} байт, Content-Type={content_type}")

    stt_path = f"/api/v1/workspaces/{workspace_id}/cards/{card_id}/audio-messages"
    stt_key = f"live-outbound-{run_id}-{card_id}-stt"
    multipart_body, multipart_type = multipart_audio_body(audio)
    common.print_request(
        "POST",
        stt_path,
        actor=f"обучаемый {student['display_name']}",
        data={
            "audio": f"outbound-call.wav ({len(audio)} bytes)",
            "direction": "OUTBOUND",
            "Idempotency-Key": stt_key,
        },
    )
    raw_response, _ = request_bytes(
        CARD_API_URL,
        "POST",
        stt_path,
        headers={
            "Accept": "application/json",
            "Content-Type": multipart_type,
            "X-User-Id": student["id"],
            "Idempotency-Key": stt_key,
        },
        body=multipart_body,
        expected_statuses=(202,),
    )
    stt_message = json.loads(raw_response.decode("utf-8"))
    stt_id = str(stt_message["id"])
    common.require(
        stt_message.get("direction") == "OUTBOUND",
        f"STT message has unexpected direction: {stt_message}",
    )

    transcript_event = wait_for_audio_event(
        stream,
        event_types={"training.audio_transcribed", "training.audio_processing_failed"},
        workspace_id=workspace_id,
        audio_message_id=stt_id,
        description=f"STT result for {stt_id}",
    )
    common.require(
        transcript_event["event_type"] == "training.audio_transcribed",
        f"Распознавание речи завершилось ошибкой: {transcript_event}",
    )
    transcript = transcript_event.get("data", {}).get("transcript")
    print(f"  Обучаемый видит расшифровку: {transcript!r}")

    evaluation_event = wait_for_audio_event(
        stream,
        event_types={
            "training.outbound_call_evaluated",
            "training.outbound_call_evaluation_failed",
        },
        workspace_id=workspace_id,
        audio_message_id=stt_id,
        description=f"semantic evaluation for {stt_id}",
    )
    common.require(
        evaluation_event["event_type"] == "training.outbound_call_evaluated",
        f"Семантическая проверка завершилась технической ошибкой: {evaluation_event}",
    )
    evaluation = evaluation_event.get("data", {})
    common.require(
        evaluation.get("passed") is expected_passed,
        "Семантическая оценка не совпала с ожидаемой: "
        f"ожидалось passed={expected_passed}, получено {evaluation}",
    )

    messages_path = f"/api/v1/workspaces/{workspace_id}/cards/{card_id}/audio-messages"
    common.print_request(
        "GET",
        messages_path,
        actor=f"обучаемый {student['display_name']}",
        data={"назначение": "что обучаемый видит в истории сообщений карточки"},
    )
    messages = common.request_json(
        CARD_API_URL,
        "GET",
        messages_path,
        headers={"X-User-Id": student["id"]},
    )
    common.print_json("История голосовых сообщений карточки", messages)
    return evaluation


def set_service_status(
    *,
    card: dict[str, Any],
    card_service: dict[str, Any],
    status: str,
    workspace_id: str,
    student: dict[str, Any],
    stream: common.RealtimeEventStream,
    run_id: str,
) -> None:
    path = f"/api/v1/card-services/{card_service['id']}/statuses"
    payload = {
        "status": status,
        "expected_card_version": card["version"],
        # The API requires occurred_at. This is the real action time, not a
        # synthetic scenario timestamp.
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        "author_id": student["id"],
        "request_id": f"live-outbound-{run_id}-{card['id']}-{status.lower()}",
    }
    common.print_request(
        "POST",
        path,
        actor=f"обучаемый {student['display_name']}",
        data={
            "status": status,
            "expected_card_version": card["version"],
            "occurred_at": "текущее UTC-время действия",
        },
    )
    response = common.request_json(
        CARD_API_URL,
        "POST",
        path,
        payload=payload,
        expected_statuses=(201,),
    )
    event = common.wait_for_realtime_event(
        stream,
        event_type="card.service.status.changed",
        workspace_id=workspace_id,
        card_id=str(card["id"]),
    )
    common.require(
        event.get("data", {}).get("status") == status,
        f"Realtime returned an unexpected service status: {event}",
    )
    card["version"] = int(event["aggregate_version"])
    card_service["current_status"] = status
    common.print_json("Результат смены статуса службы", response)


def complete_card_status(
    *,
    card: dict[str, Any],
    workspace_id: str,
    student: dict[str, Any],
    stream: common.RealtimeEventStream,
    run_id: str,
) -> None:
    path = f"/api/v1/cards/{card['id']}/statuses"
    payload = {
        "status": "COMPLETED",
        "expected_card_version": card["version"],
        "reason": "Исходящий звонок выполнен, работа службы завершена",
        "actor_id": student["id"],
        "request_id": f"live-outbound-{run_id}-{card['id']}-card-completed",
    }
    common.print_request(
        "POST",
        path,
        actor=f"обучаемый {student['display_name']}",
        data={
            "status": payload["status"],
            "expected_card_version": payload["expected_card_version"],
            "reason": payload["reason"],
        },
    )
    updated = common.request_json(CARD_API_URL, "POST", path, payload=payload)
    event = common.wait_for_realtime_event(
        stream,
        event_type="card.status.changed",
        workspace_id=workspace_id,
        card_id=str(card["id"]),
    )
    common.require(
        event.get("data", {}).get("status") == "COMPLETED",
        f"Realtime returned an unexpected card status: {event}",
    )
    card.clear()
    card.update(updated)
    card["version"] = int(event["aggregate_version"])
    common.print_json("Карточка отмечена ОТРАБОТАНА", card)


def prepare_card(
    *,
    created_event: dict[str, Any],
    card_definition: dict[str, Any],
    workspace_id: str,
    teacher: dict[str, Any],
    student: dict[str, Any],
    service: dict[str, Any],
    stream: common.RealtimeEventStream,
    run_id: str,
) -> dict[str, Any]:
    card_id = str(created_event["aggregate_id"])
    common.ensure_service_route(
        card_id,
        created_event,
        teacher,
        service,
        workspace_id,
        stream,
        run_id,
    )
    card = load_student_card(workspace_id, card_id, student)
    card_service = next(
        (
            item
            for item in card["services"]
            if item["service_id"] == service["id"] and item["is_active"]
        ),
        None,
    )
    common.require(
        card_service is not None,
        f"Карточка {card_id} не назначена службе {SERVICE_CODE}",
    )

    open_path = f"/api/v1/workspaces/{workspace_id}/cards/{card_id}/open"
    common.print_request(
        "POST",
        open_path,
        actor=f"обучаемый {student['display_name']}",
        data={"X-User-Id": student["id"]},
    )
    opened = common.request_json(
        CARD_API_URL,
        "POST",
        open_path,
        headers={"X-User-Id": student["id"]},
    )
    opened_event = common.wait_for_realtime_event(
        stream,
        event_type="card.service.opened",
        workspace_id=workspace_id,
        card_id=card_id,
    )
    common.require(
        opened.get("open_deadline_missed_at") is None,
        "Карточка открыта позднее 30 секунд",
    )
    common.replace_service(card, opened)
    card_service = opened
    card["version"] = int(opened_event["aggregate_version"])

    update_path = f"/api/v1/cards/{card_id}"
    update_payload = common.update_payload(card, card_definition, student["id"], run_id)
    common.print_request(
        "PATCH",
        update_path,
        actor=f"обучаемый {student['display_name']}",
        data={
            key: value
            for key, value in update_payload.items()
            if key not in {"actor_id", "request_id"}
        },
    )
    card = common.request_json(CARD_API_URL, "PATCH", update_path, payload=update_payload)
    updated_event = common.wait_for_realtime_event(
        stream,
        event_type="card.updated",
        workspace_id=workspace_id,
        card_id=card_id,
    )
    card["version"] = int(updated_event["aggregate_version"])
    card_service = next(item for item in card["services"] if item["id"] == opened["id"])

    common.update_features_if_expected(
        card,
        card_definition,
        student,
        workspace_id,
        stream,
        run_id,
    )

    decision_path = f"/api/v1/workspaces/{workspace_id}/cards/{card_id}/decision"
    decision_payload = {
        "decision": "ACCEPTED",
        "comment": None,
        "request_id": f"live-outbound-{run_id}-{card_id}-decision",
    }
    common.print_request(
        "POST",
        decision_path,
        actor=f"обучаемый {student['display_name']}",
        data={"decision": "ACCEPTED", "X-User-Id": student["id"]},
    )
    accepted = common.request_json(
        CARD_API_URL,
        "POST",
        decision_path,
        headers={"X-User-Id": student["id"]},
        payload=decision_payload,
    )
    accepted_event = common.wait_for_realtime_event(
        stream,
        event_type="card.service.decision",
        workspace_id=workspace_id,
        card_id=card_id,
    )
    common.require(
        accepted.get("decision_deadline_missed_at") is None,
        "Решение по карточке принято позднее трёх минут",
    )
    common.replace_service(card, accepted)
    card_service = accepted
    card["version"] = int(accepted_event["aggregate_version"])
    common.print_json("Карточка после принятия службой", card)

    set_service_status(
        card=card,
        card_service=card_service,
        status="RESPONSE_STARTED",
        workspace_id=workspace_id,
        student=student,
        stream=stream,
        run_id=run_id,
    )

    return {
        "card": card,
        "card_service": card_service,
        "card_definition": card_definition,
    }


def finish_prepared_card(
    *,
    prepared: dict[str, Any],
    call_variant: str,
    expected_semantic_passed: bool,
    workspace_id: str,
    student: dict[str, Any],
    stream: common.RealtimeEventStream,
    run_id: str,
) -> dict[str, Any]:
    card = prepared["card"]
    card_service = prepared["card_service"]
    card_definition = prepared["card_definition"]
    card_id = str(card["id"])

    rule = card_outbound_call_rule(card_definition)
    common.require(rule is not None, "Для карточки не настроен ожидаемый текст звонка")
    expected_text = str(rule["expected_text"])
    call_text = make_call_text(str(rule["spoken_text"]), call_variant)
    evaluation = run_outbound_call(
        workspace_id=workspace_id,
        card_id=card_id,
        expected_text=expected_text,
        call_text=call_text,
        expected_passed=expected_semantic_passed,
        student=student,
        stream=stream,
        run_id=run_id,
    )

    for status in ("ARRIVED", "WORK_IN_PROGRESS", "WORK_COMPLETED"):
        set_service_status(
            card=card,
            card_service=card_service,
            status=status,
            workspace_id=workspace_id,
            student=student,
            stream=stream,
            run_id=run_id,
        )
    complete_card_status(
        card=card,
        workspace_id=workspace_id,
        student=student,
        stream=stream,
        run_id=run_id,
    )
    common.print_json("Итог карточки для обучаемого", card)
    return evaluation


def wait_for_completion_readiness(
    *,
    stream: common.RealtimeEventStream,
    workspace_id: str,
    session_id: str,
    student: dict[str, Any],
) -> dict[str, Any]:
    print("  Realtime: ожидаем can_complete=true после обработки обеих карточек")
    event = stream.wait_for(
        lambda value: (
            value.get("event_type") == "training.session.completion-readiness-changed"
            and common.event_workspace_id(value) == workspace_id
            and str(value.get("aggregate_id")) == session_id
            and value.get("data", {}).get("can_complete") is True
        ),
        timeout=AUDIO_EVENT_TIMEOUT_SECONDS,
        description=f"completion readiness for session {session_id}",
    )
    common.print_json("Realtime сообщил о готовности завершения", event)

    path = f"/api/v1/training-sessions/{session_id}/completion-readiness"
    common.print_request(
        "GET",
        path,
        actor=f"обучаемый {student['display_name']}",
        data={"X-User-Id": student["id"]},
    )
    readiness = common.request_json(
        CARD_API_URL,
        "GET",
        path,
        headers={"X-User-Id": student["id"]},
    )
    common.print_json("Что видит обучаемый перед завершением", readiness)
    common.require(readiness["can_complete"] is True, f"Сценарий нельзя завершить: {readiness}")
    common.require(readiness["cards_total"] == EXPECTED_CARDS_COUNT, "Неожиданное число карточек")
    common.require(readiness["cards_pending"] == 0, "Не все карточки выпущены")
    common.require(readiness["audio_messages_pending"] == 0, "Есть необработанные аудиосообщения")
    common.require(
        readiness["semantic_evaluations_pending"] == 0,
        "Есть незавершённые семантические проверки",
    )
    common.require(not readiness["blockers"], f"Завершение заблокировано: {readiness['blockers']}")
    return readiness


def complete_session(
    *,
    session_id: str,
    workspace_id: str,
    student: dict[str, Any],
    stream: common.RealtimeEventStream,
    expected_passed: bool,
) -> dict[str, Any]:
    path = f"/api/v1/training-sessions/{session_id}/complete"
    payload = {"user_id": student["id"]}
    common.print_request(
        "POST",
        path,
        actor=f"обучаемый {student['display_name']}",
        data=payload,
    )
    result = common.request_json(CARD_API_URL, "POST", path, payload=payload)
    common.print_json("Итоговая автоматическая оценка сценария", result)
    common.require(result["status"] == "COMPLETED", "Сессия не завершена")
    common.require(
        result.get("passed") is expected_passed,
        f"Ожидалось passed={expected_passed}, получен результат {result}",
    )
    event = common.wait_for_realtime_event(
        stream,
        event_type="training.session_completed",
        workspace_id=workspace_id,
        card_id=session_id,
    )
    common.require(
        event.get("data", {}).get("passed") is expected_passed,
        f"Realtime-итог не совпал с REST-итогом: {event}",
    )
    return result


def run_attempt(
    *,
    title: str,
    scenario: dict[str, Any],
    teacher: dict[str, Any],
    student: dict[str, Any],
    service: dict[str, Any],
    variants: dict[str, tuple[str, bool]],
    expected_session_passed: bool,
) -> dict[str, Any]:
    common.print_stage(title)
    assignment = common.assign_scenario(scenario, teacher, student)
    student_assignment = common.find_assignment_as_student(
        assignment["id"], scenario["id"], student
    )
    run_id = uuid.uuid4().hex[:10]
    card_definitions = {
        card["key"]: card for card in scenario["definition"]["cards"]
    }

    with common.RealtimeEventStream(f"{REALTIME_GATEWAY_URL}/events") as stream:
        started = common.start_assignment(student_assignment, student, run_id)
        workspace_id = str(started["workspace_id"])
        session_id = str(started["session_id"])
        common.release_manual_cards(scenario, session_id, teacher)
        load_initial_student_cards(workspace_id, student)

        processed: set[str] = set()
        evaluations: dict[str, Any] = {}
        while len(processed) < EXPECTED_CARDS_COUNT:
            common.print_stage(
                f"{title}: обработка карточки "
                f"{len(processed) + 1} из {EXPECTED_CARDS_COUNT}"
            )
            created = stream.wait_for(
                lambda event: (
                    event.get("event_type") == "card.created"
                    and common.event_workspace_id(event) == workspace_id
                    and str(event.get("aggregate_id")) not in processed
                ),
                timeout=common.CARD_EVENT_TIMEOUT_SECONDS,
                description=f"next card.created in workspace {workspace_id}",
            )
            common.print_json("Новая карточка получена через realtime gateway", created)
            card_id = str(created["aggregate_id"])
            card_key = common.scheduled_card_key(session_id, card_id)
            definition = card_definitions.get(card_key)
            common.require(definition is not None, f"Не найдено определение карточки {card_key}")
            prepared = prepare_card(
                created_event=created,
                card_definition=definition,
                workspace_id=workspace_id,
                teacher=teacher,
                student=student,
                service=service,
                stream=stream,
                run_id=run_id,
            )
            variant, expected_semantic_passed = variants[card_key]
            evaluations[card_key] = finish_prepared_card(
                prepared=prepared,
                call_variant=variant,
                expected_semantic_passed=expected_semantic_passed,
                workspace_id=workspace_id,
                student=student,
                stream=stream,
                run_id=run_id,
            )
            processed.add(card_id)
            print(
                f"  Полностью обработано карточек: {len(processed)} "
                f"из {EXPECTED_CARDS_COUNT}. "
                + (
                    "Ожидаем следующую карточку, сценарий не завершается."
                    if len(processed) < EXPECTED_CARDS_COUNT
                    else "Все карточки обработаны."
                )
            )

        wait_for_completion_readiness(
            stream=stream,
            workspace_id=workspace_id,
            session_id=session_id,
            student=student,
        )
        result = complete_session(
            session_id=session_id,
            workspace_id=workspace_id,
            student=student,
            stream=stream,
            expected_passed=expected_session_passed,
        )
    return {"result": result, "evaluations": evaluations}


def verify_server_contract() -> None:
    common.verify_server_contract()
    openapi = common.request_json(CARD_API_URL, "GET", "/openapi.json")
    required_paths = {
        "/api/v1/workspaces/{workspace_id}/cards",
        "/api/v1/workspaces/{workspace_id}/cards/{card_id}",
        "/api/v1/workspaces/{workspace_id}/cards/{card_id}/tts-messages",
        "/api/v1/workspaces/{workspace_id}/cards/{card_id}/audio-messages",
        "/api/v1/audio-messages/{message_id}/content",
        "/api/v1/card-services/{card_service_id}/statuses",
    }
    missing = sorted(required_paths - set(openapi.get("paths", {})))
    common.require(not missing, f"Card API contract is outdated; missing paths: {missing}")


def main() -> None:
    configure_common_helpers()
    common.print_stage(f"Подготовка проверки исходящих звонков на {SERVER_ADDRESS}")
    for base_url, service_name in (
        (CARD_API_URL, "card-api"),
        (REALTIME_GATEWAY_URL, "realtime-gateway"),
        (ADMIN_API_URL, "admin-api"),
    ):
        common.print_request("GET", "/health", data={"service": service_name})
        health = common.request_json(base_url, "GET", "/health")
        if service_name == "admin-api":
            common.require(
                health.get("dependencies", {}).get("database") == "ok",
                f"Admin API cannot access the database: {health}",
            )
        else:
            common.require(health.get("status") == "ok", f"{service_name} is unhealthy: {health}")
    verify_server_contract()

    teacher = common.find_user(TEACHER_USERNAME, "TEACHER")
    student = common.find_user(STUDENT_USERNAME, "STUDENT")
    service = common.find_service(SERVICE_CODE)
    scenario = select_outbound_call_scenario(teacher)
    card_keys = [card["key"] for card in scenario["definition"]["cards"]]

    successful = run_attempt(
        title="Тест 1: правильные действия и правильные тексты звонков",
        scenario=scenario,
        teacher=teacher,
        student=student,
        service=service,
        variants={key: ("correct", True) for key in card_keys},
        expected_session_passed=True,
    )
    imperfect = run_attempt(
        title="Тест 2: неидеальные тексты звонков",
        scenario=scenario,
        teacher=teacher,
        student=student,
        service=service,
        variants={
            card_keys[0]: ("minor", True),
            card_keys[1]: ("significant", False),
        },
        expected_session_passed=False,
    )

    common.print_stage("Обе проверки завершены успешно")
    common.print_json(
        "Сводка",
        {
            "сценарий": {"id": scenario["id"], "name": scenario["name"]},
            "правильная_попытка": {
                "session_id": successful["result"]["id"],
                "score": successful["result"]["score"],
                "passed": successful["result"]["passed"],
            },
            "попытка_с_ошибками": {
                "session_id": imperfect["result"]["id"],
                "score": imperfect["result"]["score"],
                "passed": imperfect["result"]["passed"],
            },
        },
    )


if __name__ == "__main__":
    try:
        main()
    except (common.LiveCheckError, KeyError, TypeError, ValueError) as error:
        raise SystemExit(f"Проверка завершилась ошибкой: {error}") from error
