# Исходящий звонок ДДС

Обучаемый с позицией ДДС может звонить по открытой карточке, если её активная
служба совпадает с `position_code` участника. Исходящий звонок не создаётся для
Оператора 112 и для карточки другой службы.

```http
GET /api/v1/cards/{cardId}/outgoing-call
X-User-Id: <student-uuid>
```

Ответ `200` с `null`, если звонка пока нет. Существующий звонок возвращается
без эталонного результата и данных для модели.

```http
POST /api/v1/cards/{cardId}/outgoing-call
Content-Type: application/json

{"user_id":"<student-uuid>"}
```

Карточка должна быть открыта ДДС, а сессия — выполняться. Повтор возвращает
тот же звонок, включая уже завершённый. Ответ содержит `id`,
`training_session_id`, `workspace_id`, `incident_card_id`,
`direction: "OUTBOUND"`, `status`, `operator_user_id`, `answered_at` и
`completed_at`.

```http
POST /api/v1/outgoing-calls/{callId}/complete
Content-Type: application/json

{"user_id":"<student-uuid>"}
```

Владелец завершает свой активный звонок; ответ содержит
`status: "COMPLETED"` и `completed_at`. Повторное завершение возвращает тот же
результат. Пока звонок активен, учебная сессия не готова к завершению.

Реплики передаются и восстанавливаются через:

```http
POST /api/v1/workspaces/{workspaceId}/outgoing-calls/{callId}/audio-messages
GET  /api/v1/workspaces/{workspaceId}/outgoing-calls/{callId}/audio-messages
X-User-Id: <student-uuid>
Idempotency-Key: <unique-key-for-POST>
```

POST принимает `multipart/form-data` с файлом `audio` и необязательным
`client_sent_at`, возвращает `202`. Речь ДДС сохраняется как `STT` с
`direction: "OUTBOUND"` и ссылками на звонок и карточку. После распознавания
модель отвечает голосом руководителя группы реагирования. SSE-события и
загрузка TTS-сегментов используются те же, что для входящего звонка.

При включённой авторизации `user_id` или `X-User-Id` должен совпадать с JWT.
