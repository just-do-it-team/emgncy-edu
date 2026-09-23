"""Live E2E check for an operator-112 scenario with an incoming call.

The check creates one incoming-call template and one published scenario, then
assigns that scenario twice to the same student:

* the first assignment is completed with the exact incident-card data;
* the second assignment repeats the same dialogue but saves deliberate factual
  errors in the incident card.

In both runs gpt-oss-20b plays the trainee and asks a complete set of questions.
Its utterances are converted to audio by the public trainee TTS endpoint and
then sent back through the public call-scoped STT endpoint. Speech is not an
assessment criterion: only the final incident card is compared with
``expected_result.card``. The card is created, linked and saved only through
the trainee-facing HTTP API. Created content, assignments and sessions are
intentionally retained for inspection.

Run from ``backend`` with::

    python tests/live_incoming_call_scenario_check.py

The defaults target the deployed development stack. They can be overridden by
``S112_LIVE_SERVER_ADDRESS``, ``S112_LIVE_LLM_BASE_URL`` and
``S112_LIVE_LLM_MODEL``. The required technical participant position prefers
service ``112``, then ``101``, and can be fixed explicitly with
``S112_LIVE_POSITION_CODE``; it does not affect incoming-call card assessment.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import live_scenario_check as common


SERVER_ADDRESS = os.getenv("S112_LIVE_SERVER_ADDRESS", "http://192.168.1.10")
CARD_API_URL = f"{SERVER_ADDRESS.rstrip('/')}:8080"
REALTIME_GATEWAY_URL = f"{SERVER_ADDRESS.rstrip('/')}:8081"
ADMIN_API_URL = f"{SERVER_ADDRESS.rstrip('/')}:8082"
LLM_API_URL = os.getenv(
    "S112_LIVE_LLM_BASE_URL",
    f"{SERVER_ADDRESS.rstrip('/')}:4555/v1",
).rstrip("/")
LLM_MODEL = os.getenv("S112_LIVE_LLM_MODEL", "gpt-oss-20b")

TEACHER_USERNAME = os.getenv("S112_LIVE_TEACHER_USERNAME", "yWJJ9_z")
STUDENT_USERNAME = os.getenv("S112_LIVE_STUDENT_USERNAME", "yWJJ9_y")
POSITION_CODE = os.getenv("S112_LIVE_POSITION_CODE")

AUDIO_EVENT_TIMEOUT_SECONDS = 600
CALL_RING_TIMEOUT_SECONDS = 60
LLM_TIMEOUT_SECONDS = 180

INCIDENT = {
    "description": "В подъезде жилого дома сильный запах дыма, на втором этаже горит электрощит.",
    "reported_address": "г. Москва, ул. Учебная, д. 12, подъезд 2",
    "incident_address": "г. Москва, ул. Учебная, д. 12, подъезд 2",
    "victims_count": 1,
}


def configure_common_helpers() -> None:
    common.SERVER_ADDRESS = SERVER_ADDRESS
    common.CARD_API_URL = CARD_API_URL
    common.REALTIME_GATEWAY_URL = REALTIME_GATEWAY_URL
    common.ADMIN_API_URL = ADMIN_API_URL


def request_bytes(
    base_url: str,
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    expected_statuses: tuple[int, ...] = (200,),
    timeout: float = common.REQUEST_TIMEOUT_SECONDS,
) -> tuple[bytes, str | None]:
    request = Request(
        f"{base_url}{path}",
        data=body,
        headers=headers or {},
        method=method,
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            response_body = response.read()
            response_status = response.status
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
    if response_status not in expected_statuses:
        visible = response_body.decode("utf-8", errors="replace")
        raise common.LiveCheckError(
            f"{method} {path}: expected {expected_statuses}, "
            f"got {response_status}: {visible}"
        )
    return response_body, content_type


def multipart_audio_body(audio: bytes) -> tuple[bytes, str]:
    boundary = f"----s112-incoming-{uuid.uuid4().hex}"
    body = b"".join(
        [
            f"--{boundary}\r\n".encode(),
            (
                b'Content-Disposition: form-data; name="audio"; '
                b'filename="trainee.wav"\r\n'
            ),
            b"Content-Type: audio/wav\r\n\r\n",
            audio,
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    return body, f"multipart/form-data; boundary={boundary}"


def wait_for_audio_event(
    stream: common.RealtimeEventStream,
    *,
    event_types: set[str],
    workspace_id: str,
    audio_message_id: str,
) -> dict[str, Any]:
    event = stream.wait_for(
        lambda value: (
            value.get("event_type") in event_types
            and common.event_workspace_id(value) == workspace_id
            and str(value.get("aggregate_id")) == audio_message_id
        ),
        timeout=AUDIO_EVENT_TIMEOUT_SECONDS,
        description=f"audio result for {audio_message_id}",
    )
    common.print_json("Результат обработки аудио", event)
    return event


def llm_text(system_prompt: str, user_prompt: str) -> str:
    payload = {
        "model": LLM_MODEL,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    raw, _ = request_bytes(
        LLM_API_URL,
        "POST",
        "/chat/completions",
        headers={"Accept": "application/json", "Content-Type": "application/json"},
        body=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        timeout=LLM_TIMEOUT_SECONDS,
    )
    response = json.loads(raw.decode("utf-8"))
    choices = response.get("choices") or []
    common.require(choices, f"gpt-oss-20b returned no choices: {response}")
    content = choices[0].get("message", {}).get("content")
    common.require(
        isinstance(content, str) and bool(content.strip()),
        f"gpt-oss-20b returned empty content: {response}",
    )
    return content.strip()


def generate_trainee_question(initial_utterance: str) -> str:
    instruction = (
        "Задай заявителю короткий набор уточняющих вопросов. Обязательно явно спроси: "
        "точный адрес, что именно произошло, есть ли пострадавшие и сохраняется ли опасность."
    )
    text = llm_text(
        "Ты имитируешь обучаемого оператора 112. Верни только его реплику на русском языке, без пояснений.",
        f"Первая реплика заявителя: {initial_utterance}\n{instruction}",
    )
    return text


def generate_applicant_answer(question: str) -> str:
    facts = json.dumps(INCIDENT, ensure_ascii=False)
    return llm_text(
        "Ты имитируешь заявителя службы 112. Верни только естественную реплику заявителя на русском языке.",
        f"Скрытый профиль происшествия: {facts}\nВопрос оператора: {question}\n"
        "Сообщи все факты из профиля, которые запросил оператор.",
    )


def generate_trainee_confirmation(
    initial_utterance: str,
    question: str,
    applicant_answer: str,
) -> str:
    return llm_text(
        "Ты имитируешь обучаемого оператора 112. Верни только его итоговую реплику на русском языке, без пояснений.",
        (
            f"Заявитель: {initial_utterance}\nОператор: {question}\n"
            f"Заявитель: {applicant_answer}\n"
            "Кратко повтори заявителю установленные адрес, суть происшествия и число пострадавших, затем скажи, что помощь направлена."
        ),
    )


def choose_event_type() -> dict[str, Any]:
    event_types = common.request_json(CARD_API_URL, "GET", "/api/v1/event-types")
    common.require(event_types, "На сервере нет активных типов происшествий")
    preferred = next(
        (
            item
            for item in event_types
            if "пожар" in f"{item.get('code', '')} {item.get('name', '')}".lower()
        ),
        event_types[0],
    )
    common.print_json("Тип происшествия для теста", preferred)
    return preferred


def choose_position() -> dict[str, Any]:
    if POSITION_CODE:
        return common.find_service(POSITION_CODE)
    services = common.request_json(CARD_API_URL, "GET", "/api/v1/services")
    common.require(services, "На сервере нет активных служб для позиции участника")
    position = next(
        (item for code in ("112", "101") for item in services if item["code"] == code),
        services[0],
    )
    common.print_json(
        "Техническая позиция участника (на оценку карточки не влияет)",
        position,
    )
    return position


def create_training_content(
    teacher: dict[str, Any], event_type: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    run_id = uuid.uuid4().hex[:10]
    expected_card = {
        "event_type_id": event_type["id"],
        "description": INCIDENT["description"],
        "questionnaire": None,
        "reported_address": INCIDENT["reported_address"],
        "incident_address": INCIDENT["incident_address"],
        "victims_count": INCIDENT["victims_count"],
        "current_status": "REGISTERED",
        "features": None,
        "services": [],
        "service_statuses": {},
    }
    template_payload = {
        "name": f"Live: входящий звонок 112 ({run_id})",
        "description": "Проверка диалога, создания и сохранения карточки оператором 112",
        "difficulty": 2,
        "initial_call": {
            "initial_utterance": "Алло, помогите, в подъезде сильный запах дыма!",
        },
        "expected_result": {"card": expected_card},
        "created_by": teacher["id"],
    }
    template = common.request_json(
        CARD_API_URL,
        "POST",
        "/api/v1/incoming-call-templates",
        payload=template_payload,
        expected_statuses=(201,),
    )
    scenario_payload = {
        "name": f"Live: оператор 112 принимает звонок ({run_id})",
        "description": "Один входящий звонок, два независимых назначения: успех и ошибки",
        "difficulty": 2,
        "estimated_duration_seconds": 300,
        "workspace_mode": "INDIVIDUAL",
        "completion_policy": "STUDENT_CONFIRM",
        "min_participants": 1,
        "max_participants": 1,
        "definition": {
            "schema_version": 2,
            "mode": "STATIC",
            "cards": [
                {
                    "key": "incoming-call-112",
                    "item_type": "INCOMING_CALL",
                    "trigger_type": "TIME_OFFSET",
                    "trigger_config": {"offset_seconds": 0},
                    "source_type": "TEMPLATE",
                    "template_id": template["id"],
                }
            ],
        },
        "status": "PUBLISHED",
        "created_by": teacher["id"],
    }
    scenario = common.request_json(
        CARD_API_URL,
        "POST",
        "/api/v1/training-scenarios",
        payload=scenario_payload,
        expected_statuses=(201,),
    )
    common.print_json("Создан шаблон входящего звонка", template)
    common.print_json("Создан и опубликован сценарий", scenario)
    return template, scenario


def assign_scenario(
    scenario: dict[str, Any],
    teacher: dict[str, Any],
    student: dict[str, Any],
    position_code: str,
) -> dict[str, Any]:
    payload = {
        "scenario_id": scenario["id"],
        "participant_ids": [student["id"]],
        "participant_positions": {student["id"]: position_code},
        "assigned_by": teacher["id"],
        "launch_policy": "STUDENT_SELF_START",
        "max_attempts": 1,
    }
    assignment = common.request_json(
        CARD_API_URL,
        "POST",
        "/api/v1/scenario-assignments",
        payload=payload,
        expected_statuses=(201,),
    )
    common.require(
        assignment.get("participants", [{}])[0].get("position_code")
        == position_code,
        f"Назначение не сохранило позицию {position_code}: {assignment}",
    )
    # Read the assignment by its id. Listing all student assignments makes an
    # otherwise isolated live check depend on every historical assignment in
    # the database; one legacy snapshot must not prevent this new assignment
    # from being started.
    path = f"/api/v1/student/scenario-assignments/{assignment['id']}"
    deadline = time.monotonic() + common.REPLICA_SYNC_TIMEOUT_SECONDS
    last_error: common.LiveCheckError | None = None
    while time.monotonic() < deadline:
        try:
            student_assignment = common.request_json(
                CARD_API_URL,
                "GET",
                path,
                headers={"X-User-Id": student["id"]},
            )
        except common.LiveCheckError as error:
            last_error = error
            time.sleep(0.5)
            continue
        common.require(
            student_assignment["scenario"]["id"] == scenario["id"],
            f"Обучаемый получил другое назначение: {student_assignment}",
        )
        common.print_json(
            "Обучаемый получил созданное назначение",
            student_assignment,
        )
        return student_assignment
    raise common.LiveCheckError(
        "Созданное назначение не читается через student API: "
        f"{last_error}"
    )


def wait_for_ringing_call(session_id: str) -> dict[str, Any]:
    path = f"/api/v1/training-sessions/{session_id}/incoming-calls"
    deadline = time.monotonic() + CALL_RING_TIMEOUT_SECONDS
    last_calls: list[dict[str, Any]] = []
    while time.monotonic() < deadline:
        last_calls = common.request_json(CARD_API_URL, "GET", path)
        ringing = next(
            (item for item in last_calls if item.get("status") == "RINGING"),
            None,
        )
        if ringing is not None:
            common.print_json("Входящий звонок поступил обучаемому", ringing)
            return ringing
        time.sleep(0.5)
    raise common.LiveCheckError(
        f"Входящий звонок не перешёл в RINGING: {last_calls}"
    )


def speak_as_trainee(
    *,
    text: str,
    workspace_id: str,
    call_id: str,
    student: dict[str, Any],
    stream: common.RealtimeEventStream,
    request_prefix: str,
) -> str:
    tts_path = (
        f"/api/v1/workspaces/{workspace_id}/incoming-calls/{call_id}/tts-messages"
    )
    tts_key = f"{request_prefix}-tts"
    common.print_json("Реплика, сгенерированная gpt-oss-20b", {"text": text})
    tts_message = common.request_json(
        CARD_API_URL,
        "POST",
        tts_path,
        headers={
            "X-User-Id": student["id"],
            "Idempotency-Key": tts_key,
        },
        payload={"text": text},
        expected_statuses=(202,),
    )
    tts_event = wait_for_audio_event(
        stream,
        event_types={"training.tts_completed", "training.audio_processing_failed"},
        workspace_id=workspace_id,
        audio_message_id=str(tts_message["id"]),
    )
    common.require(
        tts_event["event_type"] == "training.tts_completed",
        f"TTS failed: {tts_event}",
    )
    audio, content_type = request_bytes(
        CARD_API_URL,
        "GET",
        f"/api/v1/audio-messages/{tts_message['id']}/content",
        headers={"X-User-Id": student["id"]},
    )
    common.require(audio, "TTS API вернул пустой аудиофайл")
    common.require(
        content_type is not None and "audio" in content_type.lower(),
        f"TTS returned unexpected Content-Type: {content_type}",
    )

    multipart, multipart_type = multipart_audio_body(audio)
    stt_key = f"{request_prefix}-stt"
    raw, _ = request_bytes(
        CARD_API_URL,
        "POST",
        f"/api/v1/workspaces/{workspace_id}/incoming-calls/{call_id}/audio-messages",
        headers={
            "Accept": "application/json",
            "Content-Type": multipart_type,
            "X-User-Id": student["id"],
            "Idempotency-Key": stt_key,
        },
        body=multipart,
        expected_statuses=(202,),
    )
    stt_message = json.loads(raw.decode("utf-8"))
    common.require(
        stt_message.get("training_call_id") == call_id,
        f"STT message is not linked to the incoming call: {stt_message}",
    )
    transcript_event = wait_for_audio_event(
        stream,
        event_types={"training.audio_transcribed", "training.audio_processing_failed"},
        workspace_id=workspace_id,
        audio_message_id=str(stt_message["id"]),
    )
    common.require(
        transcript_event["event_type"] == "training.audio_transcribed",
        f"STT failed: {transcript_event}",
    )
    transcript = transcript_event.get("data", {}).get("transcript")
    common.require(
        isinstance(transcript, str) and bool(transcript.strip()),
        f"STT returned an empty transcript: {transcript_event}",
    )
    return transcript.strip()


def create_and_link_card(
    *,
    event_type_id: int,
    workspace_id: str,
    call_id: str,
    student: dict[str, Any],
    correct_card: bool,
    run_id: str,
) -> dict[str, Any]:
    if correct_card:
        card_facts = dict(INCIDENT)
    else:
        card_facts = {
            "description": "Запах газа во дворе, открытого горения нет.",
            "reported_address": "г. Москва, ул. Ошибочная, д. 99",
            "incident_address": "г. Москва, ул. Ошибочная, д. 99",
            "victims_count": 0,
        }
    payload = {
        "workspace_id": workspace_id,
        "source_type": "MANUAL",
        "event_type_id": event_type_id,
        **card_facts,
        "operator_id": student["id"],
        "request_id": f"live-incoming-{run_id}-card",
    }
    card = common.request_json(
        CARD_API_URL,
        "POST",
        "/api/v1/cards",
        payload=payload,
        expected_statuses=(201,),
    )
    common.request_json(
        CARD_API_URL,
        "POST",
        f"/api/v1/incoming-calls/{call_id}/incident-card",
        payload={"user_id": student["id"], "incident_card_id": card["id"]},
    )
    completed_call = common.request_json(
        CARD_API_URL,
        "POST",
        f"/api/v1/incoming-calls/{call_id}/complete",
        payload={"user_id": student["id"]},
    )
    common.require(
        completed_call.get("status") == "COMPLETED",
        f"Incoming call was not completed: {completed_call}",
    )
    common.print_json("Сохранённая карточка происшествия", card)
    return card


def wait_until_ready(session_id: str, student: dict[str, Any]) -> dict[str, Any]:
    path = f"/api/v1/training-sessions/{session_id}/completion-readiness"
    deadline = time.monotonic() + AUDIO_EVENT_TIMEOUT_SECONDS
    latest: dict[str, Any] = {}
    while time.monotonic() < deadline:
        latest = common.request_json(
            CARD_API_URL,
            "GET",
            path,
            headers={"X-User-Id": student["id"]},
        )
        if latest.get("can_complete") is True:
            common.print_json("Сценарий готов к завершению", latest)
            return latest
        time.sleep(0.5)
    raise common.LiveCheckError(f"Сценарий не готов к завершению: {latest}")


def run_attempt(
    *,
    title: str,
    scenario: dict[str, Any],
    teacher: dict[str, Any],
    student: dict[str, Any],
    event_type_id: int,
    position_code: str,
    correct_card: bool,
) -> dict[str, Any]:
    common.print_stage(title)
    assignment = assign_scenario(
        scenario,
        teacher,
        student,
        position_code,
    )
    run_id = uuid.uuid4().hex[:10]
    with common.RealtimeEventStream(f"{REALTIME_GATEWAY_URL}/events") as stream:
        started = common.start_assignment(assignment, student, run_id)
        session_id = str(started["session_id"])
        workspace_id = str(started["workspace_id"])
        training_call = wait_for_ringing_call(session_id)
        call_id = str(training_call["id"])
        initial_utterance = training_call["call_payload"]["initial_utterance"]

        answered = common.request_json(
            CARD_API_URL,
            "POST",
            f"/api/v1/incoming-calls/{call_id}/answer",
            payload={"user_id": student["id"]},
        )
        common.require(answered.get("status") == "ACTIVE", f"Call is not active: {answered}")

        question = generate_trainee_question(initial_utterance)
        first_transcript = speak_as_trainee(
            text=question,
            workspace_id=workspace_id,
            call_id=call_id,
            student=student,
            stream=stream,
            request_prefix=f"live-incoming-{run_id}-question",
        )
        applicant_answer = generate_applicant_answer(question)
        common.print_json("Ответ заявителя, сгенерированный gpt-oss-20b", {"text": applicant_answer})
        confirmation = generate_trainee_confirmation(
            initial_utterance,
            question,
            applicant_answer,
        )
        second_transcript = speak_as_trainee(
            text=confirmation,
            workspace_id=workspace_id,
            call_id=call_id,
            student=student,
            stream=stream,
            request_prefix=f"live-incoming-{run_id}-confirmation",
        )
        common.print_json(
            "Расшифрованные реплики обучаемого",
            {"question": first_transcript, "confirmation": second_transcript},
        )

        create_and_link_card(
            event_type_id=event_type_id,
            workspace_id=workspace_id,
            call_id=call_id,
            student=student,
            correct_card=correct_card,
            run_id=run_id,
        )
        wait_until_ready(session_id, student)
        result = common.request_json(
            CARD_API_URL,
            "POST",
            f"/api/v1/training-sessions/{session_id}/complete",
            payload={"user_id": student["id"]},
        )
        common.print_json("Итог попытки", result)
        common.require(
            result.get("passed") is correct_card,
            f"Expected passed={correct_card}, got {result}",
        )
        calls = result.get("result", {}).get("incoming_calls", [])
        common.require(len(calls) == 1, f"Expected one evaluated incoming call: {result}")
        common.require(
            calls[0].get("passed") is correct_card,
            f"Incoming-call result does not match expected outcome: {calls[0]}",
        )
        discrepancies = calls[0].get("discrepancies") or []
        if correct_card:
            common.require(
                not discrepancies,
                f"Правильная карточка получила расхождения: {discrepancies}",
            )
        else:
            common.require(discrepancies, "Ошибочная карточка не получила расхождений")
            common.require(
                all(str(item.get("path", "")).startswith("card.") for item in discrepancies),
                "Оценка должна учитывать только поля итоговой карточки: "
                f"{discrepancies}",
            )
        return result


def verify_server_contract() -> None:
    openapi = common.request_json(CARD_API_URL, "GET", "/openapi.json")
    required = {
        "/api/v1/incoming-call-templates",
        "/api/v1/training-scenarios",
        "/api/v1/scenario-assignments",
        "/api/v1/scenario-assignments/{assignment_id}/start",
        "/api/v1/training-sessions/{session_id}/incoming-calls",
        "/api/v1/incoming-calls/{call_id}/answer",
        "/api/v1/incoming-calls/{call_id}/incident-card",
        "/api/v1/incoming-calls/{call_id}/complete",
        "/api/v1/workspaces/{workspace_id}/incoming-calls/{call_id}/tts-messages",
        "/api/v1/workspaces/{workspace_id}/incoming-calls/{call_id}/audio-messages",
        "/api/v1/cards",
        "/api/v1/training-sessions/{session_id}/complete",
    }
    missing = sorted(required - set(openapi.get("paths", {})))
    common.require(not missing, f"Card API contract is outdated; missing paths: {missing}")


def main() -> None:
    configure_common_helpers()
    common.print_stage(f"Подготовка live-проверки входящего звонка на {SERVER_ADDRESS}")
    for base_url, service_name in (
        (CARD_API_URL, "card-api"),
        (REALTIME_GATEWAY_URL, "realtime-gateway"),
        (ADMIN_API_URL, "admin-api"),
    ):
        health = common.request_json(base_url, "GET", "/health")
        common.require(
            health.get("status") == "ok"
            or health.get("dependencies", {}).get("database") == "ok",
            f"{service_name} is unhealthy: {health}",
        )
    verify_server_contract()
    # A real completion proves that the configured model is callable before any
    # persistent training content is created.
    probe = llm_text(
        "Ответь одним словом на русском языке.",
        "Напиши: готов.",
    )
    common.require(bool(probe), "gpt-oss-20b health probe returned an empty response")

    teacher = common.find_user(TEACHER_USERNAME, "TEACHER")
    student = common.find_user(STUDENT_USERNAME, "STUDENT")
    position = choose_position()
    event_type = choose_event_type()
    _, scenario = create_training_content(teacher, event_type)

    successful = run_attempt(
        title="Попытка 1: правильные вопросы и правильная карточка",
        scenario=scenario,
        teacher=teacher,
        student=student,
        event_type_id=int(event_type["id"]),
        position_code=str(position["code"]),
        correct_card=True,
    )
    unsuccessful = run_attempt(
        title="Попытка 2: полный разговор, но фактические ошибки в карточке",
        scenario=scenario,
        teacher=teacher,
        student=student,
        event_type_id=int(event_type["id"]),
        position_code=str(position["code"]),
        correct_card=False,
    )
    common.print_stage("Live-проверка завершена")
    common.print_json(
        "Итоги",
        {
            "successful_session": successful["id"],
            "successful_score": successful["score"],
            "unsuccessful_session": unsuccessful["id"],
            "unsuccessful_score": unsuccessful["score"],
            "scenario_id": scenario["id"],
        },
    )


if __name__ == "__main__":
    main()
