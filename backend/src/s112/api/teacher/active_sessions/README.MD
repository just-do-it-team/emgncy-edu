# Вкладка преподавателя «Активные сессии»

Вкладка показывает агрегированное состояние сессий преподавателя, позволяет
открыть одну сессию, запустить общий сценарий и вручную выпустить карточку.

## Список активных сессий

```http
GET /api/v1/teacher-monitoring/sessions?teacher_id={teacherId}&status=RUNNING
```

`teacher_id` обязателен. `status` по умолчанию равен `RUNNING`; пустое значение
отключает фильтр. Допустимые статусы сессии: `CREATED`, `RUNNING`, `COMPLETED`,
`ABORTED`, `TIMED_OUT`.

Ответ — массив снимков:

```json
[
  {
    "session_id": "session-uuid",
    "assignment_id": "assignment-uuid",
    "assignment_batch_id": "batch-uuid",
    "group_id": "group-uuid",
    "group_name": "Группа 101",
    "scenario_id": "scenario-uuid",
    "scenario_name": "Командная тренировка",
    "workspace_id": "workspace-uuid",
    "status": "RUNNING",
    "attempt_number": 1,
    "started_at": "2026-09-21T10:00:00Z",
    "completed_at": null,
    "score": null,
    "passed": null,
    "expert_score": null,
    "expert_passed": null,
    "final_score": null,
    "final_passed": null,
    "cards_total": 3,
    "cards_pending": 1,
    "cards_emitted": 2,
    "pending_card_keys": ["manual-summary"],
    "emitted_card_keys": ["call-1", "call-2"],
    "successful_actions": 8,
    "rejected_actions": 1,
    "last_activity_at": "2026-09-21T10:05:00Z",
    "participants": [
      {
        "user_id": "student-uuid",
        "display_name": "Иван Иванов",
        "status": "RUNNING",
        "position_code": "101"
      }
    ]
  }
]
```

`score`/`passed` — автоматическая оценка. `expert_score`/`expert_passed` —
оценка преподавателя; `final_score`/`final_passed` берут её при наличии,
иначе повторяют автоматическую. Те же итоговые поля есть в кратком списке
`GET /api/v1/training-sessions`.

Для обычного polling рекомендуется интервал 5–10 секунд. `last_activity_at`
удобен для подсветки недавно изменившихся строк. Пустые `group_*` означают
прямое назначение.

## Открыть сессию

```http
GET /api/v1/teacher-monitoring/sessions/{sessionId}?teacher_id={teacherId}
```

Возвращает тот же объект снимка. Если сессия не принадлежит преподавателю,
метод отвечает `404`, не раскрывая чужие данные.

Дополнительные данные:

```http
GET /api/v1/training-sessions/{sessionId}/scheduled-cards
GET /api/v1/training-sessions/{sessionId}/actions
GET /api/v1/workspaces/{workspaceId}/cards
X-User-Id: <teacher-uuid>
```

События `actions` отсортированы хронологически и содержат `action_type`,
`result` (`SUCCESS`, `REJECTED`, `ERROR`), состояние до/после и `details`.
Инструктор видит все карточки workspace независимо от `position_code`.

## Запустить общий сценарий

Для назначения `workspace_mode=SHARED` и `launch_policy=TEACHER_START` используется
тот же идемпотентный endpoint запуска:

```http
POST /api/v1/scenario-assignments/{assignmentId}/start
Idempotency-Key: <уникальный ключ>
Content-Type: application/json

{"user_id":"teacher-uuid"}
```

Запустить его может только преподаватель, создавший назначение. В ответе нужно
сохранить `session_id` и `workspace_id`. Повтор с тем же ключом возвращает ту же
сессию с `idempotent_replay=true`.

## Ручной выпуск карточки

Сначала выберите в плане элемент с `trigger_type=MANUAL` и `status=PENDING`:

```http
POST /api/v1/training-sessions/{sessionId}/scheduled-cards/{scenarioCardKey}/release
Content-Type: application/json

{"user_id":"teacher-uuid"}
```

Ответ — обновлённый `ScheduledCardResponse`. После фактического выпуска:

- `status` становится `EMITTED`;
- появляется `incident_card_id` и `emitted_at`;
- карточка становится доступна участникам соответствующей службы.

Повтор разрешён и не должен создавать вторую карточку для уже выпущенного
элемента плана.

## Завершение общей сессии

Общий сценарий всегда использует `completion_policy=TEACHER_ONLY`. Текущую
готовность инструктор получает тем же методом, что и обучаемый:

```http
GET /api/v1/training-sessions/{sessionId}/completion-readiness
X-User-Id: <teacher-uuid>
```

Кнопка завершения активируется при `can_complete=true`; состояние также
приходит через `training.session.completion-readiness-changed`.

```http
POST /api/v1/training-sessions/{sessionId}/complete
Content-Type: application/json

{"user_id":"teacher-uuid"}
```

В `SHARED` завершить сессию может только участник workspace с ролью
`INSTRUCTOR`. Невыпущенная карточка, ошибка выпуска или незавершённое решение
службы блокируют запрос с `409` и подробным
`detail.completion_readiness.blockers`.

## Ошибки

- `403` — указан не преподаватель либо пользователь не является инструктором;
- `404` — преподаватель, сессия или элемент плана не найдены;
- `409` — неверное состояние назначения/сессии/карточки плана;
- `422` — чужое назначение или неподдерживаемая политика запуска.
