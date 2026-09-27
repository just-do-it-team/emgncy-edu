# Вкладка преподавателя «Успеваемость»

Вкладка показывает попытки конкретного обучаемого, детальный контекст проверки
и позволяет сохранить экспертную оценку с комментарием.

## История обучаемого

```http
GET /api/v1/students/{studentId}/training-history?teacher_id={teacherId}&limit=100
```

`teacher_id` и `studentId` обязательны, `limit` — 1–500. Backend возвращает
только сессии назначений этого преподавателя, новые попытки идут первыми.

```json
[
  {
    "session_id": "session-uuid",
    "assignment_id": "assignment-uuid",
    "assignment_batch_id": "batch-uuid",
    "group_id": "group-uuid",
    "group_name": "Группа 101",
    "scenario_id": "scenario-uuid",
    "scenario_name": "Пожар в жилом доме",
    "attempt_number": 1,
    "status": "COMPLETED",
    "started_at": "2026-09-21T10:00:00Z",
    "completed_at": "2026-09-21T10:12:00Z",
    "automatic_score": "82.50",
    "automatic_passed": true,
    "automatic_result": {"cards": []},
    "expert_score": null,
    "expert_passed": null,
    "final_score": "82.50",
    "final_passed": true,
    "expert_comment": null,
    "expert_evaluated_by": null,
    "expert_evaluated_at": null
  }
]
```

`final_score`/`final_passed` уже выбирают экспертный результат при его наличии,
иначе автоматический. Оценки типа Decimal приходят JSON-строками.

Метод пока не имеет offset-пагинации. Для больших списков frontend ограничивает
выборку через `limit` и может дополнительно фильтровать загруженные строки.

## Контекст проверки

```http
GET /api/v1/training-sessions/{sessionId}/expert-review-context?teacher_id={teacherId}
```

Для отдельного звонка доступен также
`GET /api/v1/training-calls/{callId}/transcript` с `X-User-Id: <teacherId>`:
он возвращает текст обеих сторон и ссылки на доступное аудио.
После завершения звонка `GET /api/v1/training-calls/{callId}/recording` возвращает
статус сборки единого MP3 и `content_url`, когда файл готов. Это относится и к
входящим, и к исходящим звонкам. Для исходящих звонков, завершённых до этого
изменения, запись ставится в очередь миграцией `0024`.

Метод доступен после окончания сессии со статусом `COMPLETED` или `ABORTED`
преподавателю, назначившему сценарий, и администратору. Для прерванной
попытки ответ показывает сохранённые на момент прерывания действия и результаты;
если оценка не проводилась, автоматический балл и результаты карточек могут
быть `null`. Ответ содержит:

- `session` — полный `TrainingSessionResponse`, включая `status`, автоматические
  `score`/`passed`/`result` и экспертные поля;
- `scenario_snapshot` — версия сценария, сохранённая в назначении;
- `participant_ids` — UUID участников назначения;
- `cards[]` — для каждого элемента плана `scenario_card_key`,
  `incident_card_id` (может быть `null`), `expected_result`, `current_state`
  (может быть `null`) и `automatic_result` (может быть `null`);
- `actions[]` — хронология действий с `actor_user_id`, `action_type`,
  `occurred_at`, `before_state`, `after_state`, `details`;
- `call_utterances[]` — текст обработанных аудиосообщений учебных звонков в порядке
  `sequence_no`: `id`, `call_id`, `speaker`, `input_mode`, `created_at`, `text`.
  `speaker=OPERATOR` обозначает обучаемого; у другой стороны сохраняется роль
  звонка (`CALLER` или `RESPONSE_LEAD`). `input_mode=VOICE` означает STT речи
  обучаемого, `GENERATED` — ответ модели.
  `created_at` — время записи сообщения на сервере, не время фактического
  воспроизведения звука у обучаемого;
- `incoming_calls[]` — `scenario_item_key`, `training_call_id`,
  `incident_card_id`, `status`, `ringing_at`, `answered_at`, `completed_at`,
  `expected_result`, `current_state`, `automatic_result`;
  `answered_at` можно использовать как начало относительной шкалы времени.
- `outgoing_calls[]` — `id`, `card_id`, `status`, `started_at`, `completed_at`,
  `interlocutor_role`. `started_at` соответствует моменту начала разговора;
  `interlocutor_role=COMMANDER` обозначает руководителя группы реагирования.
  Персональное имя собеседника не сохраняется. `card_id` и `started_at` могут
  быть `null` у неполных старых записей. Реплики связываются со звонком через
  `call_utterances[].call_id`.

`expected_result` и `scenario_snapshot` содержат эталон и предназначены для
преподавателя. Автоматические расхождения находятся в
`cards[].automatic_result.discrepancies` и
`incoming_calls[].automatic_result.discrepancies`, а не в отдельном поле
верхнего уровня. `cards[].automatic_result` берётся из сохранённого результата
карточки; для звонка результат берётся из `session.result.incoming_calls[]`.

Элемент `cards[].automatic_result`:

```json
{
  "score": 75.0,
  "passed": false,
  "discrepancies": [
    {
      "path": "card.classification.record_id",
      "expected": 1050101,
      "actual": 1050102,
      "reason": "value_mismatch"
    }
  ],
  "evaluated_at": "2026-09-21T10:12:00Z"
}
```

Frontend может показывать `path`, `expected`, `actual` и переводить известные
`reason`. Если `automatic_result=null`, сохранённого результата для этого
элемента нет. Содержимое `expected_result` зависит от шаблона, поэтому
расхождения возникают только по проверяемым полям.

Реальные группы `discrepancies[].path` в текущем расчёте:

| Источник | Возможные `path` |
| --- | --- |
| Поля карточки | `card.classification.record_id`, `card.classification.group_code`, `card.classification.feature_1_code`, `card.classification.feature_2_code`, `card.classification.feature_3_code`, `card.classification.final_incident_type`, `card.classification.routing_flags.<key>`, `card.classification.excluded_service_codes`, `card.description`, `card.questionnaire`, `card.questionnaire.questions`, `card.questionnaire.answers`, `card.automatic_phone_number`, `card.reported_address`, `card.incident_address`, `card.victims_count`, `card.current_status`, `card.services`, `card.service_statuses.<code>` |
| История статусов ДДС | `service_status_history.<code>.length`, `service_status_history.<code>.<index>.status`, `service_status_history.<code>.<index>.comment` |
| Открытие и решение ДДС | `service_handling.<code>.opened_at`, `service_handling.<code>.open_deadline`, `service_handling.<code>.decision`, `service_handling.<code>.decision_deadline` |
| Исходящий звонок | `expected_result.outbound_call` |

`<code>` — код службы, `<index>` — индекс ожидаемого действия с нуля.
Для `card.classification.routing_flags` сравниваются ключи и эталона, и
фактической карточки. Если ожидаемое значение `questionnaire` — `null`,
расхождение будет по `card.questionnaire` целиком; если задан объект — по
`questions` или `answers`. Для входящего звонка проверяются только поля
`expected_result.card`; история статусов, тайминг ДДС и исходящий звонок к
его `automatic_result` не добавляются.

`reason=value_mismatch` используется для сравнения полей и истории статусов.
Для открытия и решения возможны `card_not_opened`,
`card_open_deadline_missed`, `card_decision_missing`,
`card_decision_deadline_missed`. Для исходящего звонка возможны
`semantic_similarity_below_threshold`, `semantic_evaluation_failed`,
`semantic_evaluation_missing` и `invalid_semantic_evaluation_rule: ...`.
`required_action_missing` встречается только в исторических результатах.

Этот endpoint пока не возвращает `criterion_code` и отдельные оценки C1–C7.
Согласованные правила будущей оценки: C1, C4, C6 — для оператора 112;
C5, C7 — для ДДС; C2, C3 — для обеих ролей. C6 должен проверять текст,
записанный обучаемым со слов заявителя в карточке. Оценки планируется
агрегировать по сценарию и участнику. Поле `provided_phone_number` уже есть
в карточке и `current_state`, но отсутствует в схеме `expected_result.card`:
поэтому сейчас эталонный номер нельзя задать и `card.provided_phone_number`
не появится в `discrepancies[].path`.

## Сохранить экспертную оценку

```http
PUT /api/v1/training-sessions/{sessionId}/expert-assessment
Content-Type: application/json

{
  "teacher_id": "teacher-uuid",
  "score": "90.00",
  "passed": true,
  "comment": "Верно выбрана служба, но адрес уточнён с задержкой"
}
```

Ограничения:

- `score` — от 0 до 100, не более двух знаков после запятой;
- `comment` — до 10 000 символов; пробелы по краям удаляются, пустая строка
  сохраняется как `null`;
- оценивать можно только сессию `COMPLETED` своего назначения; администратор
  может оценить любое назначение.

Ответ — обновлённый `TrainingSessionResponse`. PUT заменяет предыдущую экспертную
оценку целиком, поэтому после успеха нужно обновить строку истории значениями
`expert_*` и `final_*`.

## Ошибки

- список истории для неизвестной или не связанной с преподавателем пары
  `studentId`/`teacher_id` возвращает пустой массив;
- `404` — сессия для просмотра/оценки не найдена;
- `409` — сессия не завершена или отсутствуют связанные данные;
- `422` — преподаватель не владеет назначением, неверная роль либо оценка не
  прошла валидацию.
