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
статус сборки единого MP3 и `content_url`, когда файл готов.

Ответ содержит:

- `session` — базовые результаты попытки;
- `scenario_snapshot` — неизменяемая версия сценария на момент назначения;
- `participant_ids` — участники;
- `cards[]` — ожидаемое состояние, фактическое состояние и автоматический
  результат каждой карточки;
- `actions[]` — полная хронология действий.
- `call_utterances[]` — текст реплик завершённых учебных звонков в порядке
  `sequence_no`: `call_id`, `speaker`, `input_mode`, `created_at`, `text`.
  `speaker=OPERATOR` обозначает обучаемого; у другой стороны сохраняется роль
  звонка (`CALLER` или `RESPONSE_LEAD`). `input_mode=VOICE` означает STT речи
  обучаемого, `TEXT` — введённый им текст, `GENERATED` — ответ модели.
  `created_at` — время записи сообщения на сервере, не время фактического
  воспроизведения звука у обучаемого. У действий в `actions[]` есть `occurred_at`,
  `before_state`, `after_state` и `details` для сопоставления с репликами.
- `incoming_calls[]` — в том числе `ringing_at`, `answered_at` и `completed_at`;
  `answered_at` можно использовать как начало относительной шкалы времени.

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

Frontend должен показывать `path`, ожидаемое и фактическое значения и переводить
известные `reason`. Если `automatic_result=null`, карточка ещё не оценена.

Таблица ниже описывает **нынешние пути расхождений**, а не будущий расчёт
критериев по ролям. Фактические `discrepancies[].path` строятся из ожидаемых полей; сегменты в
угловых скобках означают код службы, ключ дополнительного признака или индекс:

| Критерий | Возможные `path` |
| --- | --- |
| C1 Классификация | `card.classification.record_id`, `card.classification.group_code`, `card.classification.feature_1_code`, `card.classification.feature_2_code`, `card.classification.feature_3_code`, `card.classification.final_incident_type`, `card.classification.routing_flags.<key>`, `card.classification.excluded_service_codes` |
| C2 Службы | `card.services` |
| C3 Полнота | `card.description`, `card.questionnaire`, `card.questionnaire.questions`, `card.questionnaire.answers`, `card.victims_count` |
| C4 Адрес | `card.reported_address`, `card.incident_address` |
| C5 Тайминг | `service_handling.<code>.open_deadline`, `service_handling.<code>.decision_deadline` |
| C7 Статусы реагирования | `card.current_status`, `card.service_statuses.<code>`, `service_status_history.<code>.length`, `service_status_history.<code>.<index>.status`, `service_status_history.<code>.<index>.comment`, `service_handling.<code>.opened_at`, `service_handling.<code>.decision` |

`expected_result.outbound_call` относится к проверке исходящего звонка и не
укладывается в C1–C7. Для C6 «Грамматика» отдельной автоматической проверки и
`path` сейчас нет. Это соответствие полей критериям предназначено для показа
результата: сервер пока не возвращает `criterion_code` и не выставляет отдельные
оценки по C1–C7. Поля C3 сравниваются по значению, без семантической проверки
полноты текста. Для `card.classification.routing_flags` сравниваются все ключи
эталона и сохранённой карточки.

Согласованное направление следующей версии оценки: C1, C4 и C6 относятся к
оператору 112; C5 и C7 — к ДДС; C2 и C3 применимы обеим позициям. C6 проверяет
текст, записанный Обучаемым со слов заявителя в карточке, а не адрес и не речь
виртуального заявителя. Критерии должны агрегироваться по всему сценарию и
участнику, а не становиться отдельной оценкой каждой карточки. Пока эти правила
не реализованы; особенно для C3 в карточке и эталоне ещё нет поля
предоставленного номера заявителя.

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
