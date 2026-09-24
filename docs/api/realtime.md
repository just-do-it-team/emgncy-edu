# Реалтайм и голосовой конвейер входящего звонка

Статус: реализовано на бэкенде, на фронте не подключено
Потребитель на фронте: `shared/api/realtime`, `pages/workspace-page`
Связанные файлы фронта: `frontend/src/pages/workspace-page/ui/incoming-calls.tsx`

Документ описывает контракт **как он есть в коде**, а не целевой. Исходники:
`backend/src/s112/realtime_gateway/main.py`, `backend/src/s112/speech_worker/result_worker.py`,
`backend/src/s112/dialogue/worker.py`, `backend/src/s112/api/student/audio_messages/api.py`.
Общая часть SSE — конверт события, дедупликация по `event_id`, порядок по
`aggregate_version`, `stream.gap` — описана в `backend/src/s112/realtime_gateway/README.MD`
и здесь не дублируется. Четыре события ниже в том README отсутствуют.

## Назначение

Оператор 112 принимает входящий учебный звонок и ведёт голосовой диалог с заявителем.
Речь оператора уходит на распознавание, ответ заявителя генерирует LLM и озвучивает TTS,
причём **по частям**: клиент начинает воспроизведение с первого сегмента, не дожидаясь
конца реплики. Без реалтайма конвейер не собирается — `segment_no` и `content_url`
приходят только событиями.

## Подключение к SSE

```http
GET http://localhost:8081/events?workspace_id=<uuid>
Accept: text/event-stream
Authorization: Bearer <access_token>
```

Фильтры `card_id`, `workspace_id`, `teacher_id` применяются одновременно (`AND`).

**Авторизация** (`realtime_gateway/main.py:80-93`). Зависимость `require_auth_if_enabled`
стоит на ручке всегда, но проверки выполняются только при `S112_AUTH_ENABLED=true`. Тогда:

| Условие | Ответ |
|---|---|
| `workspace_id` не передан | `403 {"detail": "Workspace subscription required"}` |
| `teacher_id` передан и не равен `sub` токена | `403 {"detail": "Workspace subscription required"}` |
| `workspace_id` не разбирается как UUID | `422 {"detail": "Invalid workspace_id"}` |
| нет записи `WorkspaceMember` для пары (workspace, пользователь) либо у неё заполнен `left_at` | `403 {"detail": "Workspace membership required"}` |

То есть при включённой авторизации `workspace_id` **обязателен**, а подписка без членства
в рабочем пространстве невозможна. При выключенной — ручка работает как раньше, без
токена и без обязательных параметров.

CORS на всех четырёх сервисах сужен до `http://localhost:5173` и `http://127.0.0.1:5173`.

### Решение фронта: fetch-стрим, а не EventSource

SSE читается **через `fetch` с `ReadableStream` и заголовком `Authorization`**. Браузерный
`EventSource` не применяется: его API не позволяет задать ни один заголовок, поэтому при
`S112_AUTH_ENABLED=true` он получит `401` и подключиться не сможет в принципе.

**Передача токена в query-параметре запрещена.** URL попадает в логи обратного прокси и
самого сервиса, в историю браузера, в заголовок `Referer` при переходе по любой ссылке со
страницы и в отчёты об ошибках. Токен действует час и даёт полный доступ от имени
пользователя — этого достаточно, чтобы считать утечку через URL неприемлемой. Если бэкенд
предложит принимать токен параметром, ответ — нет: нужен либо заголовок, либо `httpOnly`
cookie на том же origin.

Правило проекта о единственном месте с `EventSource` сохраняется в смысле «единственное
место с транспортом»: транспорт живёт в `shared/api/realtime/transport.ts`, наружу отдаёт
типизированный discriminated union, компоненты про способ чтения не знают. Замена fetch-стрима
на WebSocket обязана стоить правки одного файла.

## События голосового конвейера

Конверт стандартный. Источник первых двух — `speech_worker/result_worker.py:203-229`,
последних двух — `dialogue/worker.py:267,287` с общей сборкой в `_notify` (`worker.py:291-309`).

### `training.tts_segment_ready`

Сегмент ответа заявителя озвучен и доступен для скачивания.

`aggregate_type`: `tts_segment`, `aggregate_id`: идентификатор сегмента, `aggregate_version`: 1.

```json
{
  "training_call_id": "uuid",
  "audio_message_id": "uuid",
  "reply_to_message_id": "uuid | null",
  "segment_id": "uuid",
  "segment_no": 1,
  "generation_id": "uuid",
  "status": "COMPLETED",
  "text": "Да, дым идёт из окна на третьем этаже",
  "content_url": "/api/v1/tts-segments/<segment_id>/content",
  "error": null
}
```

Что делает фронт: скачивает `content_url`, ставит сегмент в очередь воспроизведения по
возрастанию `segment_no`, не дожидаясь остальных.

### `training.tts_segment_failed`

Сегмент озвучить не удалось. Нагрузка та же, но `content_url` равен `null`, а `error`
содержит текст ошибки. Остальные сегменты реплики при этом могут прийти успешно.

### `training.dialogue_finished`

Ответ заявителя сформирован полностью.

`aggregate_type`: `audio_message`, `aggregate_id`: идентификатор сообщения-ответа.

```json
{
  "training_call_id": "uuid",
  "audio_message_id": "uuid",
  "reply_to_message_id": "uuid",
  "generation_id": "uuid",
  "final_segment_count": 4
}
```

Что делает фронт: знает итоговое число сегментов и может достоверно определить, что реплика
дослушана. Запись следующей реплики оператора начинается после воспроизведения последнего
сегмента.

### `training.dialogue_failed`

Генерация ответа сорвалась: LLM недоступна или сегмент упал в `FAILED`. Нагрузка та же,
вместо `final_segment_count` — поле `error`. Сегменты в статусе `QUEUED` переводятся в
`CANCELLED`, сообщение-ответ получает `status=FAILED`.

## Ручки голосового конвейера

Все, кроме `/call-audio-config`, требуют заголовок `X-User-Id`. При включённой авторизации
он обязан совпадать с `sub` токена, иначе `403 {"detail": "X-User-Id does not match token"}`
(`audio_messages/api.py:84`).

### GET /api/v1/call-audio-config

Назначение: порог тишины для автоматического завершения реплики.
Доступ: без ограничений, заголовков не требует.
Ответ: `200`, `{"vad_silence_ms": 600}`. Значение из `S112_CALL_VAD_SILENCE_MS`,
диапазон 200..5000 (`backend/src/s112/common/config.py:53`).

Клиент использует его как длительность тишины, после которой запись реплики считается
законченной. Собственный порог не придумывает.

### POST /api/v1/workspaces/{workspace_id}/incoming-calls/{call_id}/audio-messages

Назначение: отправить записанную реплику оператора в уже принятый звонок.
Доступ: обучающийся, ответивший на звонок.

Заголовки: `X-User-Id` обязателен; `Idempotency-Key` обязателен, 1..128 символов, при
сетевом повторе передаётся **тот же**. Уникальность `(training_session_id, idempotency_key)`
защищает от повторной загрузки.

Тело: `multipart/form-data`.

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `audio` | файл | да | запись реплики целиком |
| `client_sent_at` | ISO-8601 | нет | момент окончания записи на клиенте |

`direction` в теле **не передаётся**: сервер жёстко ставит `OUTBOUND`, поэтому клиент не
может выдать речь оператора за реплику заявителя.

Допустимые типы: `audio/wav`, `audio/x-wav`, `audio/webm`, `audio/ogg`, `audio/mpeg`,
`audio/mp4`, `audio/x-m4a`. Предел размера — `S112_AUDIO_MAX_UPLOAD_BYTES`, по умолчанию
25 МБ. Нарезка длинных записей на фрагменты по 18 с выполняется внутри `speech-api`,
клиенту резать не нужно.

Успешный ответ: `202 Accepted`, `AudioMessageResponse`.

Ошибки:

| Код | Когда |
|---|---|
| 403 | `X-User-Id` не совпадает с токеном либо нет членства в workspace |
| 404 | workspace или звонок не найдены |
| 413 | превышен `S112_AUDIO_MAX_UPLOAD_BYTES` |
| 415 | `{"detail": "Unsupported audio content type"}` |
| 422 | `{"detail": "Idempotency-Key is blank"}` либо звонок не в статусе `ACTIVE` |
| 503 | хранилище SeaweedFS недоступно |

### POST /api/v1/workspaces/{workspace_id}/incoming-calls/{call_id}/tts-messages

Назначение: озвучить текст оператора вместо записи голоса.
Заголовки: те же, `Idempotency-Key` обязателен.
Тело: `{"text": "Вопрос оператора заявителю", "client_sent_at": null}`.
Ответ: `202`, `AudioMessageResponse`. Ошибки те же, кроме 413 и 415.

### GET /api/v1/workspaces/{workspace_id}/incoming-calls/{call_id}/audio-messages

Назначение: все реплики звонка — и оператора, и заявителя.
Ответ: `200`, `AudioMessageResponse[]`. Порядок задаёт `sequence_no`.
Состояния сообщения: `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`.

После привязки карточки к звонку эти же реплики попадают и в список аудиосообщений карточки.

### GET /api/v1/audio-messages/{message_id}/tts-segments

Назначение: полный список сегментов ответа. **Основной способ восстановления после разрыва
SSE**: клиент перечитывает список и достраивает то, чего не получил событиями.
Ответ: `200`, `TtsSegmentResponse[]` (`backend/src/s112/audio/schemas.py:58-70`).

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | идентификатор сегмента |
| `audio_message_id` | uuid | сообщение-ответ, которому принадлежит |
| `generation_id` | uuid | поколение генерации |
| `segment_no` | int | порядковый номер, с единицы |
| `text` | string | текст фразы |
| `status` | string | `QUEUED`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `sample_rate` | int \| null | частота дискретизации |
| `size_bytes` | int \| null | размер аудио |
| `last_error` | string \| null | ошибка озвучивания |
| `content_url` | string \| null | адрес байтов, заполнен у готового сегмента |

### GET /api/v1/tts-segments/{segment_id}/content

Назначение: байты озвученного сегмента.
Заголовки: `X-User-Id`.
Ответ: `200`, тело аудио. `404 {"detail": "TTS segment not found"}`, если сегмента нет или
он не готов.

## Порядок работы клиента

1. Подключиться к SSE по `workspace_id` до открытия экрана звонка.
2. Запросить `GET /call-audio-config` и взять `vad_silence_ms`.
3. По `training.incoming_call` (или опросом `GET /training-sessions/{id}/incoming-calls`)
   показать входящий звонок, принять его `POST /incoming-calls/{id}/answer`.
4. Записать реплику целиком, завершив запись по тишине длительностью `vad_silence_ms`,
   и отправить в call-scoped `audio-messages` со стабильным `Idempotency-Key`.
5. Проигрывать сегменты по `training.tts_segment_ready` в порядке `segment_no`, не
   дожидаясь конца генерации.
6. По `training.dialogue_finished` считать реплику завершённой и разрешить запись следующей.
7. При разрыве SSE перечитать `GET /audio-messages/{id}/tts-segments` и продолжить.
8. Создать карточку `POST /cards`, привязать `POST /incoming-calls/{id}/incident-card`,
   закрыть звонок `POST /incoming-calls/{id}/complete`.

Незавершённый, ошибочный или отменённый звонок блокирует завершение сессии. Пока STT или
TTS не закончили работу, `completion-readiness` отдаёт blocker `AUDIO_PROCESSING_PENDING`.

## Кэшируемость

| Данные | Класс | `staleTime` | Инвалидация |
|---|---|---|---|
| `GET /call-audio-config` | справочники | 24 ч | вручную |
| Список звонков сессии | live-данные занятия | `Infinity` | только события |
| Сегменты ответа | live-данные занятия | `Infinity` | события, при разрыве — перечитывание списка |
| Байты сегмента | неизменяемый ресурс | `Infinity` | не инвалидируется |

## Открытые вопросы

1. Как читать SSE при `S112_AUTH_ENABLED=true`, если фронт обязан слать заголовок: подтверждает
   ли бэкенд, что `fetch`-стрим поддерживается прокси на стенде без буферизации ответа.
2. Нет ручки, отдающей **исходное** аудио реплики обучающегося: наружу идут только
   TTS-сегменты заявителя. Для разбора попытки преподавателю нужна запись речи обучающегося.
3. Сроки хранения и правила доступа к записям голоса обучающихся не определены.
4. Событие появления входящего звонка в `realtime_gateway/README.MD` не описано; сейчас
   клиент узнаёт о звонке опросом.

## Требуется на бэкенде

| Приоритет | Что реализовать | Блокирует |
|---|---|---|
| P0 | Подтвердить способ авторизации SSE без `EventSource` и проверить прокси на отсутствие буферизации | реалтайм при включённой авторизации |
| P1 | Ручка выдачи исходного аудио реплики обучающегося | разбор попытки с голосом |
| P1 | Описать события голосового конвейера в `realtime_gateway/README.MD` | единственный источник контракта — чтение воркеров |
| P2 | Событие появления входящего звонка вместо опроса | лишние запросы на занятии |
