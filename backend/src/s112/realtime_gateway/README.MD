# Realtime gateway: SSE-контракт

`realtime-gateway` читает события из Kafka topic `card.events` и передаёт их
подключённым клиентам через Server-Sent Events (SSE). Канал содержит изменения,
а не полные снимки сущностей: начальное состояние нужно загрузить через REST,
после чего применять подходящие события.

## Подключение

```http
GET /events
Accept: text/event-stream
```

Доступны опциональные query-фильтры:

| Параметр | Что пропускает |
|---|---|
| `card_id` | События, у которых верхнеуровневый `aggregate_id` равен UUID карточки. Это только события агрегата `incident_card`; `training.action_recorded` по карточке сюда не попадёт. |
| `workspace_id` | События с этим `workspace_id` на верхнем уровне или в `data.workspace_id`. Основной фильтр для экрана прохождения сценария. |
| `teacher_id` | События, в которых пользователь есть в `teacher_ids` либо совпадает с `teacher_id`. Сейчас это учебные события `training.*`; обычные `card.*` не содержат преподавателей. |

Если передано несколько фильтров, они применяются одновременно (`AND`).
Примеры:

```text
GET /events?workspace_id=<workspace-uuid>
GET /events?card_id=<card-uuid>
GET /events?teacher_id=<teacher-uuid>
```

На текущем этапе gateway не выполняет аутентификацию. Его нельзя публиковать в
недоверенную сеть без reverse proxy с TLS, аутентификацией и проверкой доступа к
запрошенному workspace/teacher.

## Формат SSE и JSON-конверт

После подключения gateway сначала отправляет:

```text
retry: 3000
```

Это рекомендуемая задержка переподключения в миллисекундах. При отсутствии
событий отправляются SSE-комментарии `: heartbeat`; они поддерживают соединение
и не должны попадать в бизнес-обработчик.

Каждое событие выглядит так:

```text
id: 9bce9c94-7d2f-4e7d-a106-7a7189d536ab
event: card.updated
data: {"event_id":"9bce...","event_type":"card.updated",...}
```

`data` всегда содержит полный JSON-конверт:

```json
{
  "event_id": "event-uuid",
  "event_type": "card.updated",
  "aggregate_type": "incident_card",
  "aggregate_id": "card-uuid",
  "aggregate_version": 7,
  "workspace_id": "workspace-uuid",
  "teacher_id": "teacher-uuid",
  "teacher_ids": ["teacher-uuid"],
  "occurred_at": "2026-09-21T10:00:00.000000+00:00",
  "data": {}
}
```

Поля `teacher_id` и `teacher_ids` есть только у соответствующих учебных
событий. Значение полей:

- `event_id` — уникальный идентификатор события; хранить для дедупликации;
- `event_type` — тип события, совпадает с SSE-полем `event`;
- `aggregate_type` — `incident_card` или `training_session`;
- `aggregate_id` — UUID карточки или учебной сессии;
- `aggregate_version` — версия карточки, ревизия readiness либо номер попытки
  для остальных событий сессии;
- `workspace_id` — рабочее пространство, к которому относится событие;
- `occurred_at` — время формирования события backend в UTC;
- `data` — полезная нагрузка конкретного типа.

Не следует сравнивать `aggregate_version` между разными агрегатами. Для
`incident_card` клиент применяет только версии новее локальной. Для readiness
используется собственная монотонная `data.revision`.

## События карточки

Все события этого раздела имеют:

```json
{
  "aggregate_type": "incident_card",
  "aggregate_id": "card-uuid",
  "aggregate_version": 4,
  "workspace_id": "workspace-uuid",
  "data": {"workspace_id": "workspace-uuid"}
}
```

Полезная нагрузка является дельтой. После первого `card.created` рекомендуется
один раз запросить полный снимок:

```http
GET /api/v1/workspaces/{workspaceId}/cards/{cardId}
X-User-Id: <user-uuid>
```

### `card.created`

Карточка создана и доступна в workspace.

```json
{
  "workspace_id": "workspace-uuid",
  "card_number": "2026-000001",
  "event_type_id": 1,
  "current_status": "REGISTERED"
}
```

### `card.updated`

Изменены основные поля карточки. Значения полей в событие не включаются.

```json
{
  "workspace_id": "workspace-uuid",
  "changed_fields": ["description", "victims_count"]
}
```

Новые значения берутся из ответа изменяющего REST-запроса. Если изменение
выполнил другой клиент, перечитайте карточку через REST.

### `card.features.updated`

Изменена классификация карточки.

```json
{
  "workspace_id": "workspace-uuid",
  "event_kind_id": 10,
  "first_order_feature_id": 100,
  "second_order_feature_id": 200,
  "third_order_feature_id": null,
  "incident_type_id": "incident-type-uuid",
  "feature_revision": 2
}
```

### `card.status.changed`

Изменён общий статус карточки.

```json
{
  "workspace_id": "workspace-uuid",
  "status": "PROCESSED",
  "reason": "Комментарий оператора"
}
```

### `card.service.added`

Карточка направлена службе автоматически или вручную.

```json
{
  "workspace_id": "workspace-uuid",
  "card_service_id": "card-service-uuid",
  "service_id": "service-uuid",
  "acceptance_deadline_at": "2026-09-21T10:00:30+00:00"
}
```

`acceptance_deadline_at` — крайний срок открытия карточки оператором службы.

### `card.service.opened`

Оператор раскрыл карточку. С этого момента начинается трёхминутный срок решения.

```json
{
  "workspace_id": "workspace-uuid",
  "card_service_id": "card-service-uuid",
  "service_id": "service-uuid",
  "decision_deadline_at": "2026-09-21T10:03:10+00:00"
}
```

### `card.service.decision`

Служба приняла или отклонила карточку.

```json
{
  "workspace_id": "workspace-uuid",
  "card_service_id": "card-service-uuid",
  "service_id": "service-uuid",
  "decision": "ACCEPTED",
  "comment": null
}
```

`decision` равен `ACCEPTED` либо `REJECTED`; при отказе `comment` обязателен.

### `card.service.status.changed`

Изменён статус реагирования службы общим методом статусов.

```json
{
  "workspace_id": "workspace-uuid",
  "card_service_id": "card-service-uuid",
  "service_id": "service-uuid",
  "status": "WORK_IN_PROGRESS",
  "occurred_at": "2026-09-21T10:04:00+00:00"
}
```

### `card.service.open-deadline-missed`

Карточка не была открыта за 30 секунд. Привязка службы получает
`NOT_NOTIFIED`, но оператор по-прежнему может открыть её и принять решение.

```json
{
  "workspace_id": "workspace-uuid",
  "card_service_id": "card-service-uuid",
  "service_id": "service-uuid",
  "deadline_at": "2026-09-21T10:00:30+00:00"
}
```

### `card.service.decision-deadline-missed`

После открытия решение не принято за три минуты. Просрочка фиксируется, но
последующее решение остаётся разрешено.

```json
{
  "workspace_id": "workspace-uuid",
  "card_service_id": "card-service-uuid",
  "service_id": "service-uuid",
  "deadline_at": "2026-09-21T10:03:10+00:00"
}
```

## События учебной сессии

Учебные события имеют `aggregate_type=training_session` и
`aggregate_id=session_id`. Они содержат `teacher_id`/`teacher_ids`, поэтому
доступны как по `workspace_id`, так и по `teacher_id`.

### `training.session_started`

Сессия и workspace созданы, план карточек зафиксирован.

```json
{
  "session_id": "session-uuid",
  "assignment_id": "assignment-uuid",
  "workspace_id": "workspace-uuid",
  "attempt_number": 1,
  "participants_count": 3
}
```

`participants_count` присутствует только у общего сценария.

### `training.action_recorded`

Зафиксировано успешное или отклонённое действие в учебной сессии.

```json
{
  "session_id": "session-uuid",
  "workspace_id": "workspace-uuid",
  "action_type": "CARD_ACCEPTED",
  "action_result": "SUCCESS",
  "actor_user_id": "student-uuid",
  "incident_card_id": "card-uuid",
  "error": "текст ошибки"
}
```

Сейчас `action_result` равен `SUCCESS` или `REJECTED`. Поле `error` есть у
отклонённого действия. Это событие создаётся, если в workspace есть активный
инструктор. Оно предназначено прежде всего для мониторинга преподавателя;
точная история доступна через `GET /api/v1/training-sessions/{sessionId}/actions`.

### Результаты обработки аудио

События `training.audio_transcribed`, `training.tts_completed` и
`training.audio_processing_failed` сообщают результат асинхронной обработки
аудиореплики. `data` содержит
`audio_message_id`, `session_id`, `workspace_id`, `incident_card_id`,
`sequence_no`, `kind`, `direction`, `status`, а также `transcript` для STT или
`content_url` для готового аудио. При окончательной ошибке заполнено `error`.

### Результаты проверки исходящего звонка

`training.outbound_call_evaluated` сообщает результат семантического сравнения
распознанного исходящего сообщения с ожидаемым текстом. `data` содержит
`audio_message_id`, `session_id`, `incident_card_id`, `expected_text`,
`actual_text`, `minimum_similarity`, `similarity`, `passed`, `missing_facts`,
`contradictions`, `explanation` и модель. Если llama-server недоступен после
всех попыток, приходит `training.outbound_call_evaluation_failed` с полем
`error`.

### `training.session.completion-readiness-changed`

Изменилось каноническое состояние готовности к завершению. Событие возникает,
когда выпущена карточка, обработана служба, изменился blocker либо сессия стала
готова. Поле `data` совпадает с ответом readiness endpoint:

```json
{
  "training_session_id": "session-uuid",
  "status": "RUNNING",
  "completion_policy": "STUDENT_CONFIRM",
  "can_complete": true,
  "ready_to_complete_at": "2026-09-21T10:05:00+00:00",
  "cards_total": 3,
  "cards_pending": 0,
  "cards_emitted": 3,
  "cards_failed": 0,
  "cards_cancelled": 0,
  "decisions_required": 2,
  "decisions_completed": 2,
  "audio_messages_total": 2,
  "audio_messages_pending": 0,
  "audio_messages_failed": 0,
  "semantic_evaluations_total": 1,
  "semantic_evaluations_pending": 0,
  "semantic_evaluations_failed": 0,
  "pending_card_keys": [],
  "failed_card_keys": [],
  "cancelled_card_keys": [],
  "waiting_for_decision": [],
  "next_scheduled_at": null,
  "blockers": [],
  "revision": 4
}
```

`can_complete=true` означает одновременно:

- все элементы плана выпущены (`PENDING` отсутствует);
- нет `FAILED` и `CANCELLED` элементов;
- у всех активных служб, соответствующих `position_code` участников, есть
  решение (`decided_at`);
- все принятые STT-реплики обработаны и внесены в `training_action`;
- все запрошенные семантические проверки исходящих звонков завершены;
- сессия находится в `RUNNING`.

Карточка, не направленная ни одной службе участников, не требует от них
решения. Это позволяет одному оператору не блокироваться на карточках другой
службы в многослужебном сценарии.

Возможные `blockers[].code`:

| Код | Значение |
|---|---|
| `SCENARIO_CARD_PENDING` | Карточка ещё ожидает временной, событийный или ручной триггер. |
| `SCENARIO_CARD_FAILED` | Worker исчерпал попытки выпуска карточки. |
| `SCENARIO_CARD_CANCELLED` | Элемент плана отменён. |
| `EMITTED_CARD_MISSING_INCIDENT` | Неконсистентность: выпуск отмечен, но UUID карточки отсутствует. |
| `SERVICE_DECISION_PENDING` | Служба участника ещё не приняла и не отклонила карточку. |
| `AUDIO_PROCESSING_PENDING` | Аудиореплика ещё распознаётся или ожидает записи результата в журнал действий. |
| `SEMANTIC_EVALUATION_PENDING` | Исходящий звонок ожидает результата семантической проверки. |
| `SESSION_NOT_RUNNING` | Сессия уже завершена либо находится в другом состоянии. |

Для первоначальной загрузки и восстановления после разрыва используйте:

```http
GET /api/v1/training-sessions/{sessionId}/completion-readiness
X-User-Id: <workspace-member-uuid>
```

### `training.session_completed`

Сессия оценена и workspace переведён в `READ_ONLY`.

```json
{
  "session_id": "session-uuid",
  "assignment_id": "assignment-uuid",
  "workspace_id": "workspace-uuid",
  "score": 87.5,
  "passed": false,
  "completed_automatically": false
}
```

Подробные расхождения находятся в REST-ответе `TrainingSessionResponse.result`.

### `training.expert_assessment_updated`

Преподаватель сохранил или заменил экспертную оценку завершённой сессии.

```json
{
  "session_id": "session-uuid",
  "assignment_id": "assignment-uuid",
  "workspace_id": "workspace-uuid",
  "score": 90.0,
  "passed": true
}
```

## Локальное событие `stream.gap`

Если очередь конкретного SSE-клиента переполнена, gateway удаляет старейшее
непрочитанное событие и помещает в поток:

```json
{
  "event_id": "event-uuid",
  "event_type": "stream.gap",
  "aggregate_id": "last-aggregate-id",
  "data": {
    "reason": "client_queue_overflow",
    "resync_required": true
  }
}
```

После `stream.gap` нельзя продолжать применять дельты к старому состоянию.
Клиент должен перечитать через REST карточки workspace, план сессии и
completion readiness, затем продолжить обработку новых событий.

## Доставка, дедупликация и восстановление

- Outbox и бизнес-изменение фиксируются одной транзакцией.
- Доставка имеет семантику at-least-once, поэтому одно событие может прийти
  повторно. Дедупликация выполняется по `event_id`.
- Порядок версий гарантируется внутри одного outbox-агрегата, но не между
  разными карточками и учебной сессией.
- Gateway начинает чтение Kafka с `latest` для своей consumer group и не хранит
  персональный журнал SSE-клиента. Заголовок `Last-Event-ID` сейчас не
  обрабатывается: пропущенные события восстанавливаются через REST.
- После reconnect сначала загрузите актуальный REST-снимок, затем применяйте
  события с более новой версией/ревизией.
- Read-запросы общего API могут обслуживаться PostgreSQL replica и ненадолго
  отставать. Readiness endpoint специально читает primary; для только что
  изменённой карточки самым свежим источником остаётся ответ изменяющего запроса.

Рекомендуемый поток экрана сценария:

1. Подключить `/events?workspace_id=...` до запуска или загрузки экрана.
2. Загрузить текущие карточки, план и completion readiness через REST.
3. На `card.created` гидратировать новую карточку одним GET.
4. Применять дельты карточки, контролируя `aggregate_version`.
5. На `training.session.completion-readiness-changed` заменить весь локальный
   readiness новым `data`, контролируя `revision`.
6. При `stream.gap`, reconnect или неизвестном типе/версии выполнить REST-resync.
