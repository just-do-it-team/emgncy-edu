# Разбор попытки: звонок, запись, журнал действий, контекст оценки

Статус: реализовано на бэкенде, дельты — в «Требуется на бэкенде»
Потребитель на фронте: `entities/call-transcript`, `entities/call-recording`,
`entities/card-timeline`, `entities/expert-review`, экран разбора попытки
Связанные файлы фронта: `frontend/src/shared/api/contracts/{call-transcript,call-recording,training-actions,expert-review,json}.ts`,
`frontend/src/entities/{call-transcript,call-recording,card-timeline,expert-review}/**`

## Назначение

Преподавателю нужно видеть, что сказал заявитель, что в этот момент делал обучающийся и что
из этого засчитала автоматическая проверка. Разбор собирается из пяти существующих ручек:
расшифровка и запись звонка, журнал действий сессии, контекст экспертной оценки и назначение
(из него берётся роль участника). Своих ручек фронт не вводит; ранее описанные
`/training-sessions/{id}/call-transcript` и `/training-sessions/{id}/timeline` сняты.

Экран — `/teacher/attempts/{session_id}/review` (`pages/teacher-session-review`). Вход в него —
экран «Обучающиеся» `/teacher/students` (`pages/teacher-student-results`): список из
`GET /api/v1/students?teacher_id=…`, попытки выбранного — из
`GET /api/v1/students/{student_id}/training-history?teacher_id=…&limit=500`, поле `session_id`.
Имена обучающихся — из того же `GET /api/v1/students`, названия служб — из `GET /api/v1/services`.

Моки: `VITE_MOCK_CALL_TRANSCRIPT`, `VITE_MOCK_CARD_TIMELINE`, `VITE_MOCK_EXPERT_REVIEW`,
`VITE_MOCK_STUDENTS`, `VITE_MOCK_SERVICES`, по умолчанию выключены. У записи звонка мока нет:
подставной звук не делается, без стенда экран показывает, что запись недоступна.
Моки включаются, если на стенде нет завершённой попытки со звонком.

## Ручки

### GET /api/v1/training-calls/{call_id}/transcript

Назначение: расшифровка входящего звонка.
Отношение к существующему: существующая, используется как есть.
Доступ: участник звонка и преподаватель назначения (`can_access_training_call`).
Заголовки: `X-User-Id` обязателен; при `S112_AUTH_ENABLED=true` обязан совпадать с токеном.

Успешный ответ: 200

| Поле | Тип | Описание |
|---|---|---|
| `call_id` | uuid | звонок |
| `training_session_id` | uuid | сессия |
| `answered_at` | datetime \| null | ответ на звонок; ноль реальной оси |
| `completed_at` | datetime \| null | отбой |
| `utterances` | array | реплики |

Элемент `utterances`:

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | `audio_message` |
| `speaker` | `OPERATOR` \| `CALLER` \| `RESPONSE_LEAD` | обучающийся, заявитель, старший бригады |
| `input_mode` | `VOICE` \| `TEXT` \| `GENERATED` | речь обучающегося, набранный текст, реплика модели |
| `sequence_no` | int | порядок в звонке |
| `created_at` | datetime | момент записи сообщения |
| `duration_ms` | int \| null | длительность звучания; `null`, если не определена |
| `text` | string | текст |
| `audio_urls` | string[] | TTS-сегменты или файл сообщения |

Ошибки: 403 — `X-User-Id` не совпадает с токеном; 404 — звонка нет или нет доступа.

Две оси времени на фронте (`toCallTranscript`):
- **реальная** — `created_at − answered_at` каждой реплики;
- **ось записи** — сумма `duration_ms` предыдущих реплик: запись склеивается без пауз. Если хотя
  бы одна `duration_ms` равна `null`, ось не строится и экран показывает «синхронизация
  недоступна»; ноль и оценки не подставляются.
- Ось записи дополнительно сверяется с `duration_ms` записи (`alignRecordingAxis`, допуск
  `RECORDING_SYNC_TOLERANCE_MS` = 250 мс). Расшифровка пропускает сообщения с пустым текстом, а
  запись включает их аудио; при таком пропуске суммы расходятся, и ось снимается, а не
  сдвигается молча.

### GET /api/v1/training-calls/{call_id}/recording

Назначение: метаданные склеенной записи звонка.
Отношение к существующему: существующая.
Доступ и заголовки: как у расшифровки. Только входящие звонки.

Успешный ответ: 200, `Cache-Control: private, no-store`

| Поле | Тип | Описание |
|---|---|---|
| `call_id` | uuid | звонок |
| `status` | `QUEUED` \| `PROCESSING` \| `READY` \| `FAILED` | состояние сборки |
| `content_type` | string \| null | заполнен при `READY` |
| `duration_ms` | int \| null | заполнен при `READY` |
| `size_bytes` | int \| null | заполнен при `READY` |
| `completed_at` | datetime \| null | заполнен при `READY` |
| `content_url` | string \| null | заполнен при `READY` |
| `last_error` | string \| null | заполнен при `FAILED` |

Ошибки: 403 — `X-User-Id` не совпадает с токеном; 404 — нет доступа, звонок исходящий или
записи нет; 409 — звонок не завершён.

Фронт опрашивает ручку каждые 3 с, пока статус `QUEUED` или `PROCESSING`: события готовности
записи нет. `READY` без любого из обязательных полей считается нарушением контракта.

### GET /api/v1/training-calls/{call_id}/recording/content

Назначение: файл записи, `audio/mpeg`, поддерживает `Range`.
Доступ и ошибки: как у метаданных; дополнительно 409 — запись не готова, 503 — хранилище
недоступно или не сошлась контрольная сумма, 416 — неверный диапазон.

Тег `<audio>` не умеет слать `X-User-Id`, поэтому файл забирается общим axios-клиентом как
`Blob`, из него строится object URL, который отзывается при размонтировании.

### GET /api/v1/training-sessions/{session_id}/actions

Назначение: журнал действий сессии.
Отношение к существующему: существующая.
Доступ: **проверки нет** — ни `X-User-Id`, ни токена. См. «Требуется на бэкенде».

Ответ — голый массив `TrainingActionResponse`, по возрастанию `occurred_at`:

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | действие |
| `training_session_id`, `workspace_id` | uuid | привязка |
| `actor_user_id` | uuid \| null | автор; `null` у системных действий |
| `incident_card_id` | uuid \| null | карточка |
| `action_type` | string | 23 типа |
| `entity_type`, `entity_id` | string \| null | объект действия |
| `occurred_at` | datetime | момент |
| `result` | `SUCCESS` \| `REJECTED` \| `ERROR` | исход |
| `before_state`, `after_state` | object \| null | снимки; у `CARD_UPDATED` — ядро карточки |
| `details` | object | `changed_fields`, `comment`, `service_id`, `error` и т. п. |

Адаптер `toActionTimeline` нормализует действия в события с сохранением исходного
`action_type`, считает смещение от ответа на звонок и для `CARD_UPDATED` сравнивает
`before_state` с `after_state` поле за полем. Результат сверяется с `details.changed_fields`:
поля, заявленные, но не изменившиеся, и изменившиеся, но не заявленные, выводятся отдельно.
Действия с `result` не `SUCCESS` выделяются в отдельный вид с текстом `details.error`;
исключение — `OUTBOUND_CALL_EVALUATED`, где `REJECTED` означает сходство ниже порога.

### GET /api/v1/training-sessions/{session_id}/expert-review-context

Назначение: всё для экспертной оценки одной сессии. Отвечает 409, пока сессия не в
`COMPLETED`, в том числе для прерванных: такие попытки в списке результатов не ведут в разбор.
Отношение к существующему: существующая.
Доступ: преподаватель, назначивший сессию.
Query: `teacher_id` (uuid, обязателен).

| Поле | Тип | Описание |
|---|---|---|
| `session` | `TrainingSessionResponse` | сессия: `score` (строка-десятичное), `passed`, `result.cards[]`, `result.incoming_calls[]`, `expert_*` |
| `scenario_snapshot` | object | снимок сценария на момент назначения |
| `participant_ids` | uuid[] | участники |
| `cards` | array | `scenario_card_key`, `incident_card_id`, `expected_result`, `current_state`, `automatic_result` |
| `incoming_calls` | array | `scenario_item_key`, `training_call_id`, `incident_card_id`, `status`, `ringing_at`, `answered_at`, `completed_at`, `expected_result`, `current_state`, `automatic_result` |
| `call_utterances` | array | реплики без длительности и аудио; фронт берёт расшифровку из ручки звонка |
| `actions` | array | тот же `TrainingActionResponse`, что и в журнале |

`call_id` для расшифровки и записи — `incoming_calls[].training_call_id`.

`automatic_result`: `score` (число 0..100), `passed`, `discrepancies[] {path, expected, actual,
reason}`. У карточки есть `evaluated_at`, у звонка нет. В `session.result` тот же балл лежит
строкой. `passed` — отсутствие расхождений; `score = (проверок − расхождений) / проверок × 100`,
у сессии — среднее по элементам.

### PUT /api/v1/training-sessions/{session_id}/expert-assessment

Назначение: сохранить экспертную оценку. Экрана пока нет, мутация готова.
Тело: `teacher_id` uuid; `score` десятичное 0..100, два знака, передаётся строкой; `passed`
bool; `comment` string ≤ 10 000 или `null`, пробелы по краям обрезаются.
Ответ: 200, `TrainingSessionResponse`; фронт кладёт его в кэш контекста.

### GET /api/v1/teacher/scenario-assignments/{assignment_id}

Назначение: роль участника для разбора, `participants[].participant_role` —
`OPERATOR_112` \| `DDS`. В контексте оценки роли нет.
Заголовки: `X-User-Id` преподавателя. Ошибки: 403 — не преподаватель; 404 — чужое назначение.

## Пример

Звонок о задымлении квартиры. Моки — `call-transcript.mocks.ts`, `card-timeline.mocks.ts`,
`expert-review.mocks.ts`:

```
+15 900 мс  CALLER    «Ленинский проспект, дом 14, второй подъезд, седьмой этаж, квартира 58.»
+24 100 мс  OPERATOR  «Открытый огонь видите или только дым?»
+47 800 мс  OPERATOR  TEXT «Не приближайтесь к дыму, выходите наружу.»
+57 800 мс  CARD_UPDATED  reported_address, incident_address = «…Ленинский проспект, д. 41…»
+75 100 мс  CARD_UPDATED  REJECTED: Card version conflict: expected 3, actual 5
```

Дом 14 и дом 41 — перестановка цифр на слух. Между репликой с адресом и записью в карточку
нет ни одного переспроса. Автоматическая проверка даёт расхождение `card.reported_address`.

## Связанные SSE-события

| Событие | Когда | Что делает фронт |
|---|---|---|
| `training.expert_assessment_updated` | сохранена экспертная оценка | подписчика пока нет; при подключении — инвалидация контекста оценки сессии |

Готовность записи событием не сообщается — отсюда опрос.

## Кэшируемость

- Расшифровка, журнал действий — снимок завершённой попытки: `staleTime` `Infinity`,
  `gcTime` 30 мин, `retry` выключен.
- Метаданные записи — снимок, пока статус финальный; при `QUEUED`/`PROCESSING` `staleTime` 0 и
  опрос 3 с. Файл записи — `gcTime` 1 мин, чтобы не держать мегабайты в памяти.
- Контекст оценки — класс «карточка»: 15 с / 5 мин; мутация оценки обновляет его через
  `setQueryData`.
- Назначение — полусправочник: 5 мин / 30 мин.

## Открытые вопросы

1. Смещения реплик внутри записи. Сейчас их нет, фронт складывает `duration_ms`. Предпочтение
   фронта — `start_ms` у каждой реплики расшифровки, считанный воркером склейки.
2. Сообщения с пустым текстом. Расшифровка их пропускает, запись включает. Предпочтение фронта —
   отдавать их в расшифровке с пустым `text`.
3. Разбивка по критериям. Сервер не возвращает `criterion_code`, фронт раскладывает пути сам по
   таблице `teacher/performance/README.MD`. Предпочтение фронта — `criterion_code` в каждом
   расхождении и перечень применимых к роли критериев.
4. Смысл `created_at` реплики. Поле ставится базой в момент вставки `audio_message`:
   - речь обучающегося (`OPERATOR`, `VOICE`) вставляется после загрузки файла — это конец фразы;
   - набранный текст обучающегося (`OPERATOR`, `TEXT`) вставляется при отправке текста, до синтеза;
   - реплики заявителя и бригады (`GENERATED`) вставляются в начале генерации, до синтеза.

   Допущение фронта: начало речи обучающегося на реальной оси — `created_at − duration_ms`;
   если `duration_ms` нет, реплика остаётся на `created_at` без поправки. Остальные реплики
   рисуются от `created_at`: звучание у них начинается позже на время синтеза, и эта задержка
   не известна. Точность поправки ограничена задержкой загрузки файла после конца фразы,
   поэтому дельта остаётся открытой. Предпочтение фронта — отдельное поле `spoken_at` с
   началом звучания у каждой реплики.
5. Роль участника для элемента общей попытки. В `SHARED` оператор 112 и диспетчер ДДС работают
   в одной сессии, а `automatic_result` не говорит, чья это работа. Фронт в этом случае не
   раскладывает расхождения по критериям и показывает, что применимость не определена.
   Предпочтение фронта — `participant_user_id` у каждого элемента контекста.

## Требуется на бэкенде

| Приоритет | Что реализовать | Блокирует |
|---|---|---|
| P0 | Проверка доступа в `GET /training-sessions/{id}/actions` | журнал действий, включая тексты комментариев и снимки карточки с адресами, читается кем угодно по id сессии |
| P1 | Идентичность преподавателя в `expert-review-context` из токена или `X-User-Id`, а не из query | `teacher_id` в URL подделывается и попадает в журналы прокси |
| P1 | `participant_role` участника в `expert-review-context` | сейчас нужен второй запрос к назначению |
| P1 | `start_ms` реплики в записи и реплики с пустым текстом в расшифровке | синхронизация записи с репликами без догадок |
| P1 | `criterion_code` в `discrepancies[]` | раскладка по критериям живёт на фронте и расходится при любом новом пути |
| P1 | `participant_user_id` у элементов контекста | разбор общей попытки по критериям роли |
| P2 | `spoken_at` у реплики расшифровки | точное положение реплики на реальной оси |
| P2 | Событие готовности записи | опрос каждые 3 с |
| P2 | `evaluated_at` в `automatic_result` звонка | асимметрия с карточкой |
