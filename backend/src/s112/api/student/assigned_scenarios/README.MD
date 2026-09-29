# Вкладка обучаемого «Назначенные сценарии»

При `AUTH_ENABLED=true` нужен Bearer-токен; `X-User-Id` и `user_id`
действующего обучаемого из примеров ниже можно опустить. См.
[правила переключения](../../README.MD).

Вкладка показывает назначения текущего обучаемого и запускает новую попытку.
Все даты API — ISO 8601. Пока общая авторизация не подключена, frontend передаёт
UUID текущего пользователя в `X-User-Id`.

## Получить назначения

```http
GET /api/v1/student/scenario-assignments?status=ASSIGNED
X-User-Id: <student-uuid>
```

Параметры:

- `status` — необязательный фильтр: `ASSIGNED`, `RUNNING`, `COMPLETED`,
  `CANCELLED`, `EXPIRED`.

Ответ — массив назначений текущего обучаемого, новые элементы идут первыми:

```json
[
  {
    "id": "assignment-uuid",
    "scenario": {
      "id": "scenario-uuid",
      "revision": 3,
      "name": "Одиночная тренировка",
      "description": "Учебный пожар",
      "difficulty": 2,
      "estimated_duration_seconds": 600,
      "cards_count": 2,
      "workspace_mode": "INDIVIDUAL",
      "completion_policy": "STUDENT_CONFIRM"
    },
    "assigned_by": "teacher-uuid",
    "launch_policy": "STUDENT_SELF_START",
    "max_attempts": 2,
    "attempts_used": 1,
    "status": "ASSIGNED",
    "available_from": "2026-09-21T09:00:00Z",
    "due_at": "2026-09-28T18:00:00Z",
    "created_at": "2026-09-20T12:00:00Z",
    "participant": {
      "user_id": "student-uuid",
      "status": "RUNNING",
      "position_code": "101",
      "participant_role": "DDS",
      "ready_at": null,
      "completed_at": null
    },
    "active_session": {
      "session_id": "session-uuid",
      "workspace_id": "workspace-uuid",
      "attempt_number": 1,
      "status": "RUNNING",
      "started_at": "2026-09-21T10:00:00Z"
    }
  }
]
```

`scenario` содержит только безопасные метаданные зафиксированной в назначении
версии. В ответе принципиально отсутствуют `definition`, `expected_result`,
эталонные тексты и ожидаемые действия. Студентский frontend
не должен обращаться к преподавательскому `GET /api/v1/training-scenarios/{id}`.
`cards_count` учитывает статические карточки и плановое число процедурных.
`attempts_used` считает уже созданные попытки, включая активную; отдельный
запрос списка сессий для счётчика не нужен. `participant_role` равен `DDS`
при коде службы и `OPERATOR_112` при `position_code: null`.

Для одного назначения доступен такой же контракт:

```http
GET /api/v1/student/scenario-assignments/{assignmentId}
X-User-Id: <student-uuid>
```

### Восстановление запущенной попытки

`active_session` равен `null`, пока активной попытки нет. После запуска он
содержит идентификаторы сессии и workspace. Поэтому после перезагрузки страницы,
потери ответа `POST /start`, входа с другого устройства или запуска сессии
преподавателем frontend повторяет student GET и:

1. находит нужное назначение;
2. если `active_session != null`, открывает экран прохождения по
   `active_session.session_id` и `active_session.workspace_id`;
3. если `active_session == null`, оставляет доступным обычный запуск согласно
   `launch_policy` и статусу назначения.

Запрос читается с read replica, поэтому сразу после старта допустима короткая
задержка репликации: при восстановлении frontend может повторить GET с небольшим
интервалом. Новая попытка при этом не создаётся.

## Запустить попытку

```http
POST /api/v1/scenario-assignments/{assignmentId}/start
Idempotency-Key: <уникальный ключ нажатия>
Content-Type: application/json

{"user_id":"student-uuid"}
```

`Idempotency-Key` обязателен, имеет длину 1–128 символов и должен сохраняться
frontend до получения успешного ответа. Повтор того же запроса с тем же ключом
возвращает уже созданную сессию, а не создаёт новую попытку.

```json
{
  "session_id": "session-uuid",
  "workspace_id": "workspace-uuid",
  "assignment_id": "assignment-uuid",
  "attempt_number": 1,
  "status": "RUNNING",
  "started_at": "2026-09-21T10:00:00Z",
  "idempotent_replay": false
}
```

После успеха frontend переходит во вкладку прохождения и сохраняет
`session_id` и `workspace_id` в состоянии маршрута. Эти значения не являются
единственной точкой восстановления: канонический источник после перезагрузки —
`active_session` student endpoint выше.

Для участника с `participant_role=DDS` порядок работы с карточкой и общим
card-api описан в [README прохождения сценария](../scenario_session/README.MD#сценарий-оператора-ддс-работа-с-card-api).

Кнопка самостоятельного запуска уместна только при
`launch_policy=STUDENT_SELF_START`, статусе `ASSIGNED`, наступившем
`available_from` и непросроченном `due_at`. Окончательное решение всё равно
принимает backend.

## Ошибки

- `404` — назначение не найдено;
- `403` — `X-User-Id` не принадлежит обучаемому;
- `409` — назначение ещё недоступно, просрочено, завершено, уже имеет активную
  сессию либо исчерпан лимит попыток;
- `422` — пользователь не является участником или назначение нельзя запускать
  самостоятельно;
- стандартный `422` FastAPI — отсутствует/неверен заголовок или тело запроса.

Текст причины находится в `detail`; его можно показывать в уведомлении после
перевода известных сообщений на стороне frontend.
