# Вкладка обучаемого «Прохождение сценария»

После запуска назначения frontend получает `session_id` и `workspace_id`.
Большинство методов текущей сессии используют `workspace_id` и обязательный
заголовок `X-User-Id`.

## Присутствие в сценарии

```http
POST /api/v1/training-sessions/{sessionId}/presence
Authorization: Bearer <access_token>
X-User-Id: <student-uuid>
```

Тело не требуется. Ответ `204 No Content`. Отправляйте запрос сразу после
открытия активной сессии и затем каждые 5 секунд, пока открыт экран сценария,
независимо от состояния SSE. Время фиксирует сервер. Доступ есть только у
активного участника workspace; для завершённой сессии возвращается `409`.

Scenario worker прерывает сессию после 30 секунд без heartbeat **всех** её
участников; проверка выполняется каждые 5 секунд. Учёт начинается после
первого heartbeat, поэтому ранее созданные сессии без таких сигналов не
прерываются автоматически. Автоматическое прерывание расходует попытку из
лимита назначения, как обычный abort, и отмечается причиной
`PRESENCE_TIMEOUT` в журнале действий.

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
      "event_type_id": null,
      "classification": {"record_id": 1010101, "group_code": 1, "feature_1_code": 1, "feature_2_code": 1, "feature_3_code": 1, "final_incident_type": "пожар: мусор", "routing_flags": {}, "excluded_service_codes": []},
      "event_kind_id": null,
      "incident_address": "г. Москва, ул. Учебная, д. 10",
      "victims_count": 0,
      "current_status": "REGISTERED",
      "services_summary": [],
      "features_summary": {},
      "registered_at": "2026-09-21T10:00:00Z",
      "last_updated_at": "2026-09-21T10:00:00Z",
      "version": 1
    }
  ],
  "next_cursor": "opaque-server-cursor"
}
```

Для участника с ролью `DDS` backend оставляет только карточки его службы.
Оператор 112 (`position_code: null`) видит все карточки своей учебной сессии.
Основные поля строки: `card_id`, `card_number`, `classification`, адрес,
`current_status`, `services_summary`, `version`.

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

При добавлении службы передайте `added_reason: "CLASSIFIER"`, если клиент
определил её по `incident_classifier_reference.json`, либо `"MANUAL"` для
дополнительной службы. Если поле не передано, используется `MANUAL`. Значение
возвращается в ответе службы и в сводке карточки. Это указание источника от
клиента; сервер пока не сверяет его с JSON-классификатором.

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

## Сценарий оператора ДДС: работа с card-api

Если в назначении `participant.participant_role=DDS` и задан
`participant.position_code`, обучаемый работает с карточками, направленными
его службе. `card.created` служит сигналом перечитать список workspace;
`GET /api/v1/workspaces/{workspaceId}/cards` уже фильтрует его по службе.
Для полного состояния откройте
`GET /api/v1/workspaces/{workspaceId}/cards/{cardId}`. В `services[]` найдите
запись своей службы по `service_id` (код и ID доступны в `GET /api/v1/services`);
её `id` — это `cardServiceId` для истории и последующих статусов.

1. При открытии карточки вызовите `POST /api/v1/workspaces/{workspaceId}/cards/{cardId}/open`
   с `X-User-Id`. Сервер запишет `RECEIVED` и вернёт `CardServiceResponse`
   с `received_at` и `decision_deadline_at`. Повторное открытие безопасно.
2. При необходимости исправьте карточку общим card-api. Например:

   ```http
   PATCH /api/v1/cards/{cardId}
   Content-Type: application/json

   {"expected_version":2,"victims_count":0,"actor_id":"student-uuid","request_id":"edit-uuid"}
   ```

   `PATCH` возвращает `CardResponse` с новой `version`. Так же ДДС может
   обновить признаки через `PUT /api/v1/cards/{cardId}/features`, статус
   карточки через `POST /api/v1/cards/{cardId}/statuses` и добавить нужную
   службу через `POST /api/v1/cards/{cardId}/services`. Для последнего метода
   нужны `service_id`, `expected_card_version` и `actor_id`. Эти методы
   доступны ДДС только для карточки, направленной его собственной службе.
3. Зафиксируйте решение по **своей** службе через
   `POST /api/v1/workspaces/{workspaceId}/cards/{cardId}/decision` с
   `decision=ACCEPTED` или `REJECTED`. Для отклонения обязателен комментарий.
   Это действие отличается от смены общего статуса карточки.
4. Если сценарий требует исходящего оповещения, передайте запись через
   `POST /api/v1/workspaces/{workspaceId}/cards/{cardId}/audio-messages`
   с `direction=OUTBOUND`, `X-User-Id` и `Idempotency-Key`. Ожидаемый текст
   обучаемому не выдаётся; обработку записи отслеживайте по audio API.
   Подробнее — в [README аудиосообщений](../audio_messages/README.MD).
5. Статусы реагирования своей службы после решения отправляйте по одному:

   ```http
   POST /api/v1/card-services/{cardServiceId}/statuses
   Content-Type: application/json

   {"status":"RESPONSE_STARTED","expected_card_version":4,"occurred_at":"2026-09-21T10:02:00Z","author_id":"student-uuid","comment":"Расчёт выехал","unit_number":"АЦ-12","request_id":"status-uuid"}
   ```

   Далее допустимы переходы `ARRIVED` → `WORK_IN_PROGRESS` →
   `WORK_COMPLETED` либо предусмотренный правилами отказ. Ответ — запись
   `ServiceStatusResponse`, **без** новой версии карточки. Историю можно
   прочитать через `GET /api/v1/card-services/{cardServiceId}/status-history`.
   ДДС не может менять статусы реагирования чужой службы.

В запросах общего card-api ID пользователя передаётся в теле (`actor_id` или
`author_id`), а для `/open`, `/decision` и audio API — в `X-User-Id`.
При включённой авторизации ID должен совпадать с пользователем JWT.
Числа `expected_version` в примерах условные. После `/open`,
`/decision` и каждого `/card-services/{id}/statuses` перечитайте полную
карточку: эти действия увеличивают её `version`, но их ответы новую версию
не возвращают. Перед каждым следующим изменением используйте актуальную
версию. При `409` повторно получите карточку и предложите применить правку
снова.

Проверка `completion-readiness` учитывает решение службы и обработку аудио,
но не требует всей ожидаемой истории статусов или правильного содержания
карточки. Поэтому `can_complete=true` не означает успешную оценку: если
шаблон требует дальнейшие статусы, отправьте их до `POST /complete`.
При `AUTO_WHEN_READY` сервер может завершить сессию сразу после выполнения
условий readiness, до поздних ручных правок или статусов.

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

Индивидуальную попытку можно завершить досрочно:

```http
POST /api/v1/training-sessions/{sessionId}/abort
Content-Type: application/json

{"user_id":"student-uuid"}
```

Ответ — `TrainingSessionResponse` со статусом `ABORTED`. Workspace становится
`READ_ONLY`, попытка учитывается в лимите. `score` и `result` рассчитываются по
уже выпущенным карточкам и завершённым звонкам по тем же правилам, что при
обычном завершении. `passed=true` возможно, если вся работа была готова к
завершению и оценка каждого элемента успешна. Повторный запрос того же
участника возвращает сохранённый результат.

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
