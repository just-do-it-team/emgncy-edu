# Вкладка обучаемого «Прохождение сценария»

После запуска назначения frontend получает `session_id` и `workspace_id`.
Большинство методов текущей сессии используют `workspace_id` и обязательный
заголовок `X-User-Id`.

## Рекомендуемый поток

1. Подключиться к SSE `/events?workspace_id={workspaceId}`.
2. Загрузить план и completion readiness через REST как начальный снимок.
3. Получать новые карточки прежде всего по `card.created`; после него один раз
   загрузить полный снимок карточки.
4. Открыть карточку, зафиксировать решение службы и при необходимости изменить
   данные карточки.
5. Передавать и отслеживать аудиореплики через API, описанный в
   [`../audio_messages/README.MD`](../audio_messages/README.MD).
6. Обновлять возможность завершения по событию
   `training.session.completion-readiness-changed`.
7. Завершить сессию согласно её `completion_policy` и показать результат.

## Карточки рабочего пространства

```http
GET /api/v1/workspaces/{workspaceId}/cards?limit=100
X-User-Id: <student-uuid>
```

Возвращает страницу, отсортированную от новых карточек к старым. Порядок
стабилизирован по паре `(registered_at, card_id)`:

```json
{
  "items": [
    {
      "card_id": "card-uuid",
      "workspace_id": "workspace-uuid",
      "card_number": "112-000001",
      "event_type_id": 1,
      "event_kind_id": null,
      "incident_address": "г. Москва, ул. Учебная, д. 10",
      "victims_count": 0,
      "current_status": "REGISTERED",
      "services_summary": [],
      "features_summary": {
        "event_kind_id": null,
        "first_order_feature_id": null,
        "second_order_feature_id": null,
        "third_order_feature_id": null,
        "incident_type_id": null,
        "additional_features": {},
        "revision": null
      },
      "registered_at": "2026-09-21T10:00:00Z",
      "last_updated_at": "2026-09-21T10:00:00Z",
      "version": 1
    }
  ],
  "next_cursor": "opaque-server-cursor"
}
```

Для участника с `position_code` backend оставляет только карточки его службы.
Основные поля строки: `card_id`, `card_number`, `event_type_id`, адрес,
`current_status`, `services_summary`, `features_summary`, `version`.

Если `next_cursor` не равен `null`, следующая страница запрашивается без
изменения `limit`:

```http
GET /api/v1/workspaces/{workspaceId}/cards?limit=100&cursor={nextCursor}
X-User-Id: <student-uuid>
```

Frontend хранит и передаёт cursor как непрозрачную строку, не разбирает и не
изменяет его. `next_cursor=null` означает конец списка. При обновлении экрана
первую страницу следует снова запросить без cursor; новые realtime-карточки
добавляются в начало локального списка с дедупликацией по `card_id`.

```http
GET /api/v1/workspaces/{workspaceId}/cards/{cardId}
X-User-Id: <student-uuid>
```

Возвращает полный `CardResponse`, включая `features`, `services` и текущую
`version`. Карточка из другого workspace возвращается как не найденная.

## Открыть карточку своей службы

```http
POST /api/v1/workspaces/{workspaceId}/cards/{cardId}/open
X-User-Id: <student-uuid>
```

Тело не требуется. Ответ — `CardServiceResponse`. Для таймеров важны поля:

- `acceptance_deadline_at` — срок открытия;
- `received_at` — фактическое открытие;
- `decision_deadline_at` — срок решения;
- `open_deadline_missed_at` — зафиксированная просрочка открытия;
- `current_status` после успеха — `RECEIVED`.

Повторный вызов безопасен и возвращает текущее состояние привязки службы.

## Принять или отклонить

```http
POST /api/v1/workspaces/{workspaceId}/cards/{cardId}/decision
X-User-Id: <student-uuid>
Content-Type: application/json

{
  "decision": "ACCEPTED",
  "comment": null,
  "request_id": "ui-decision-uuid"
}
```

`decision` допускает только `ACCEPTED` и `REJECTED`. Для `REJECTED` непустой
`comment` обязателен. После успеха ответ содержит `decided_at`, возможный
`decision_deadline_missed_at` и новый `current_status`.

`request_id` рекомендуется генерировать на одно пользовательское действие и
сохранять при сетевом повторе.

## Редактирование карточки

Эти общие методы используются внутри сценария:

- `PATCH /api/v1/cards/{cardId}` — описание, анкета, адреса, число пострадавших;
- `PUT /api/v1/cards/{cardId}/features` — классификационные признаки;
- `POST /api/v1/cards/{cardId}/statuses` — статус карточки;
- `POST /api/v1/cards/{cardId}/services` — добавить службу;
- `GET /api/v1/event-types` и вложенные endpoints признаков — справочники;

`questionnaire` карточки — либо `null`, либо объект строго из двух строк:
`{"questions":"...","answers":"..."}`. Дополнительные признаки карточки
не обязательны в первой версии. После удаления `feature_schema` сервер
проверяет принадлежность типовых признаков выбранному виду происшествия,
но не применяет отдельную JSON Schema к `additional_features`.

`service_routing_rule` — серверная таблица автоматического назначения служб:
правило относится к `event_kind`, проверяет условие на
`additional_features` и добавляет службу с нужным способом оповещения и
маршрутом отправки. При пустой таблице автоматической маршрутизации нет;
назначенные вручную службы карточки продолжают работать. Это не схема полей
карточки и фронтенду она напрямую не требуется.

Изменяющие запросы принимают `expected_version` или `expected_card_version`.
После каждого успеха нужно заменить локальную версию значением из ответа.
`409` означает конфликт оптимистической блокировки: frontend должен перечитать
карточку и предложить повторить изменение, а не отправлять запрос бесконечно.

## План и завершение

```http
GET /api/v1/training-sessions/{sessionId}/scheduled-cards
GET /api/v1/training-sessions/{sessionId}/actions
```

Статусы элемента плана: `PENDING`, `EMITTED`, `FAILED`, `CANCELLED`.
`incident_card_id` появляется после выпуска карточки.

Каноническая проверка возможности завершения:

```http
GET /api/v1/training-sessions/{sessionId}/completion-readiness
X-User-Id: <student-uuid>
```

Основные поля ответа:

- `completion_policy` — кто и как завершает сессию;
- `can_complete` — можно ли завершить её сейчас;
- `cards_total/pending/emitted/failed/cancelled` — состояние плана;
- `generation_status`, `generated_cards`, `generation_target` — состояние
  процедурного генератора;
- `decisions_required/decisions_completed` — решения служб участников;
- `audio_messages_total/pending/failed` — состояние обработки аудиореплик;
- `waiting_for_decision` — карточка и служба, от которых ещё ожидается решение;
- `next_scheduled_at` — ближайший запланированный выпуск, если он известен;
- `blockers` — точные причины `can_complete=false`;
- `revision` — монотонная версия readiness.

`can_complete=true`, только когда все карточки выпущены, выпуск не завершился
ошибкой/отменой, а все службы, совпадающие с `position_code` участников, приняли
или отклонили свои карточки. Просрочка открытия или решения ухудшает оценку, но
после фактического решения больше не блокирует завершение.

Для процедурного сценария завершение дополнительно заблокировано, пока
генератор не перейдёт в `EXHAUSTED` и по каждой созданной им карточке не будут
выполнены ожидаемые действия. `PROCEDURAL_GENERATION_FAILED` означает ошибку
состояния генератора, которую должен разобрать преподаватель или администратор.

Политики:

- `STUDENT_CONFIRM` — после `can_complete=true` существующая кнопка завершения
  становится активной; дополнительный элемент интерфейса не нужен;
- `AUTO_WHEN_READY` — backend сам завершает индивидуальную сессию, frontend
  ожидает `training.session_completed`;
- `TEACHER_ONLY` — используется общим сценарием, завершение выполняет
  инструктор.

```http
POST /api/v1/training-sessions/{sessionId}/complete
Content-Type: application/json

{"user_id":"student-uuid"}
```

Ответ — `TrainingSessionResponse` со статусом `COMPLETED`, полями `score`,
`passed`, `completed_automatically` и `result`. В `result.cards[]` и
`result.incoming_calls[]` есть `score`, `passed`, `discrepancies`. Каждое
расхождение содержит строго `path`, `expected`, `actual`, `reason`; например,
`reason=value_mismatch` означает несовпадение поля итоговой карточки. Повтор
завершения идемпотентен. Ранняя попытка возвращает `409`; в
`detail.completion_readiness` находится тот же снимок с blockers, поэтому
frontend может сразу обновить состояние кнопки без дополнительного запроса.

Поля `completion_policy`, `completion_state`, `completion_state_revision` и
`ready_to_complete_at` также присутствуют в `TrainingSessionResponse`.
`completion_state` до первого расчёта может быть `{}`, затем содержит структуру
`completion-readiness`; после завершения его `status=COMPLETED` и
`can_complete=false`. Для окончательного результата используйте `result`, а не
`completion_state`.

Полный контракт событий находится в
[`../../../realtime_gateway/README.MD`](../../../realtime_gateway/README.MD).

## Ошибки

- `403` — нет активного членства в workspace или карточка не относится к службе;
- `404` — workspace-карточка или сессия не найдены;
- `409` — конфликт версии/состояния, преждевременное завершение либо ручное
  завершение сессии с `AUTO_WHEN_READY`;
- `422` — недопустимое решение, отсутствующий комментарий или нарушение правил
  карточки.
