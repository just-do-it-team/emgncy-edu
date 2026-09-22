# Аудиосообщения обучаемого

Аудиосообщение связывается с учебной сессией, workspace, карточкой и
пользователем в момент приёма. Исходный файл и сгенерированное TTS-аудио
хранятся в SeaweedFS; в PostgreSQL сохраняются только метаданные, текст и
состояние обработки.

## STT

```http
POST /api/v1/workspaces/{workspaceId}/cards/{cardId}/audio-messages
X-User-Id: <student-uuid>
Idempotency-Key: <stable-request-id>
Content-Type: multipart/form-data

audio=<file>
client_sent_at=<optional ISO-8601 timestamp>
direction=INBOUND|OUTBOUND
```

Допустимы WAV, WebM, OGG, MP3 и M4A. API сначала сохраняет файл в SeaweedFS,
затем одной транзакцией создаёт `audio_message` и событие в общем
`outbox_event`. Ответ `202` означает, что сообщение принято в обработку.
SeaweedFS-объект получает `Seaweed-*` attributes с идентификаторами сообщения,
сессии, workspace, карточки и отправителя, направлением, временем приёма и
SHA-256; те же данные в типизированном виде хранятся в `audio_message`.
По умолчанию `direction=INBOUND`. Для записи исходящего оповещения оператора
передаётся `OUTBOUND`; после STT такая реплика может быть направлена на
семантическую проверку.

После распознавания в `audio_message.transcript` сохраняется текст, а
result-outbox публикует `audio.stt.completed`. Отдельный consumer записывает
append-only действие `AUDIO_MESSAGE_TRANSCRIBED` в `training_action`. Оно не
изменяет состояние карточки и не заменяет действия вроде принятия карточки.

## TTS

```http
POST /api/v1/workspaces/{workspaceId}/cards/{cardId}/tts-messages
X-User-Id: <student-uuid>
Idempotency-Key: <stable-request-id>
Content-Type: application/json

{"text":"Текст для озвучивания","client_sent_at":null}
```

Текст проходит тот же outbox/Kafka pipeline. TTS worker сохраняет WAV в
SeaweedFS и публикует `audio.tts.completed` через result-outbox.

## Чтение состояния

```http
GET /api/v1/workspaces/{workspaceId}/cards/{cardId}/audio-messages
GET /api/v1/audio-messages/{audioMessageId}
GET /api/v1/audio-messages/{audioMessageId}/content
X-User-Id: <user-uuid>
```

Состояния: `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`. Поле `sequence_no`
задаёт серверный порядок реплик внутри сессии. При `FAILED` клиент может
отправить новую реплику с новым `Idempotency-Key`. Ошибка считается терминальным
результатом и сама по себе не блокирует завершение: успешная повторная реплика
получит новый `sequence_no`, а отсутствие требуемого действия будет учтено при
итоговом сравнении сценария.

Пока STT находится в `QUEUED`/`PROCESSING` или готовая расшифровка ещё не
записана в `training_action`, завершение сценария блокируется причиной
`AUDIO_PROCESSING_PENDING`.

## Семантическая проверка исходящего звонка

Для карточки правило задаётся в `evaluation_rules`:

```json
{
  "outbound_call": {
    "expected_text": "Ожидаемый текст оповещения руководителя бригады",
    "minimum_similarity": 0.8
  }
}
```

После распознавания `STT + OUTBOUND` consumer фиксирует действие
`OUTBOUND_CALL_EVALUATION_REQUESTED` и request-outbox в одной транзакции.
LLM-worker получает ожидаемый и распознанный текст через Kafka, вызывает
OpenAI-совместимый `/v1/chat/completions`, а результат возвращает через второй
outbox/topic. До записи `OUTBOUND_CALL_EVALUATED` завершение блокируется кодом
`SEMANTIC_EVALUATION_PENDING`. Оценка ниже `minimum_similarity` записывается как
`REJECTED`, ошибка LLM — как `ERROR`; оба результата позволяют завершить
сессию, но карточка итоговую проверку не проходит.

## Доставка и идемпотентность

- отдельная таблица `audio_outbox` не создаётся: общий `outbox_event` уже
  маршрутизирует каждую запись по полю `topic`, а порядок блокируется только
  внутри `(aggregate_type, aggregate_id)`; аудио использует собственный
  `aggregate_type=audio_message` и поэтому не смешивается с событиями карточек;
- уникальность `(training_session_id, idempotency_key)` защищает API от
  повторной загрузки;
- Kafka работает с семантикой at-least-once;
- `event_inbox` дедуплицирует события отдельно для каждой consumer group;
- Kafka offset фиксируется только после commit результата в PostgreSQL;
- исходное и результирующее события используют один `audio_message` aggregate
  с версиями 1 и 2 в существующем `outbox_event`;
- orphan-reconciler удаляет только объекты, которых нет в `audio_message` и
  возраст которых превышает защитный интервал.
