# Вкладка обучаемого «Назначенные сценарии»

Вкладка показывает назначения текущего обучаемого и запускает новую попытку.
Все даты API — ISO 8601. Пока общая авторизация не подключена, frontend передаёт
UUID текущего пользователя явно.

## Получить назначения

```http
GET /api/v1/scenario-assignments?participant_user_id={studentId}&status=ASSIGNED
```

Параметры:

- `participant_user_id` — UUID текущего обучаемого; для этой вкладки обязателен;
- `status` — необязательный фильтр: `ASSIGNED`, `RUNNING`, `COMPLETED`,
  `CANCELLED`, `EXPIRED`;
- `group_id` и `assigned_by` поддерживаются общим методом, но обычно не нужны
  в интерфейсе обучаемого.

Ответ — массив назначений, новые элементы идут первыми:

```json
[
  {
    "id": "assignment-uuid",
    "scenario_id": "scenario-uuid",
    "scenario_revision": 3,
    "assignment_batch_id": null,
    "assigned_by": "teacher-uuid",
    "workspace_mode": "INDIVIDUAL",
    "launch_policy": "STUDENT_SELF_START",
    "max_attempts": 2,
    "status": "ASSIGNED",
    "available_from": "2026-09-21T09:00:00Z",
    "due_at": "2026-09-28T18:00:00Z",
    "created_at": "2026-09-20T12:00:00Z",
    "participants": [
      {
        "user_id": "student-uuid",
        "status": "ASSIGNED",
        "position_code": "101",
        "ready_at": null,
        "completed_at": null
      }
    ]
  }
]
```

Ответ назначения пока не содержит название и описание сценария. Их нужно
получить через `GET /api/v1/training-scenarios/{scenario_id}` и кэшировать по
`scenario_id`. `scenario_revision` показывает, какая версия была зафиксирована
в назначении.

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
`session_id` и `workspace_id` в состоянии маршрута.

Кнопка самостоятельного запуска уместна только при
`launch_policy=STUDENT_SELF_START`, статусе `ASSIGNED`, наступившем
`available_from` и непросроченном `due_at`. Окончательное решение всё равно
принимает backend.

## Ошибки

- `404` — назначение не найдено;
- `409` — назначение ещё недоступно, просрочено, завершено, уже имеет активную
  сессию либо исчерпан лимит попыток;
- `422` — пользователь не является участником или назначение нельзя запускать
  самостоятельно;
- стандартный `422` FastAPI — отсутствует/неверен заголовок или тело запроса.

Текст причины находится в `detail`; его можно показывать в уведомлении после
перевода известных сообщений на стороне frontend.
