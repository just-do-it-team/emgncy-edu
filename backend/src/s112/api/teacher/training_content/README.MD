# Вкладка преподавателя «Сценарии обучения»

Вкладка состоит из конструктора шаблонов карточек и конструктора сценариев.
Изменение опубликованного сценария запрещено: редактируется только `DRAFT`.

## Шаблоны карточек

```http
GET /api/v1/card-templates?active_only=true
GET /api/v1/card-templates/{templateId}
```

Список сортируется по названию, ключу и версии. `active_only=false` позволяет
показать деактивированные версии.

Создание версии:

```http
POST /api/v1/card-templates
Content-Type: application/json

{
  "template_key": null,
  "version": 1,
  "name": "Пожар в жилом доме",
  "description": "Базовая карточка",
  "difficulty": 2,
  "initial_card": {
    "event_type_id": 1,
    "source_type": "CALL",
    "description": "Дым из окна",
    "incident_address": "Учебный адрес",
    "victims_count": 0,
    "features": {
      "event_kind_id": 10,
      "first_order_feature_id": 100,
      "additional_features": {}
    }
  },
  "expected_result": {
    "final_state": {"event_type_id": 1},
    "required_actions": [
      {"action_type": "CARD_FEATURES_UPDATED", "deadline_seconds": 120}
    ]
  },
  "evaluation_rules": {},
  "created_by": "teacher-uuid"
}
```

Для первой версии `template_key` можно не передавать. Для следующей версии
передайте тот же `template_key` и новый `version`. PATCH шаблона намеренно нет:
созданная версия неизменяема.

`expected_result` допускает только `final_state` и `required_actions`; неизвестные
поля, включая `forbidden_actions`, дают `422`.

Для карточки с обязательным исходящим звонком семантическое правило задаётся
отдельно от точных действий:

```json
"evaluation_rules": {
  "outbound_call": {
    "expected_text": "Текст, смысл которого должен передать оператор",
    "minimum_similarity": 0.8
  }
}
```

`minimum_similarity` находится в диапазоне `0..1`. Неизвестные ключи внутри
`outbound_call` запрещены. Правило применяется только к распознанным
аудиосообщениям с направлением `OUTBOUND`.

Ранее созданные шаблоны сложности 2 с `evaluation_rules.call_evaluation` и
действием `RESPONSE_TEAM_LEADER_CALLED` также поддерживаются. Ожидаемый текст
берётся из `parameters.expected_transcript`: сначала из поля, указанного в
`comparison_field`, затем из `required_facts` или `reference_text`. Для новых
шаблонов предпочтителен компактный контракт `outbound_call` выше.

```http
DELETE /api/v1/card-templates/{templateId}
Content-Type: application/json

{"deleted_by":"teacher-uuid"}
```

Успех — `204`. Метод деактивирует версию и возвращает `409`, если она используется
неархивированным сценарием.

## Шаблоны входящих звонков

```http
POST /api/v1/incoming-call-templates
GET /api/v1/incoming-call-templates?active_only=true
GET /api/v1/incoming-call-templates/{templateId}
DELETE /api/v1/incoming-call-templates/{templateId}
```

Шаблон также версионируется и после создания не изменяется. В `initial_call`
хранятся только стартовая реплика и закрытый серверный контекст для будущего
LLM-абонента. Эталон речи остаётся частью `expected_result`, обычно в параметрах
обязательного действия семантической оценки:

```json
{
  "name": "Очевидец пожара",
  "difficulty": 2,
  "initial_call": {
    "initial_utterance": "Алло, из окна соседней квартиры идёт дым!",
    "context": {
      "caller_role": "WITNESS",
      "incident_address": "г. Москва, ул. Лесная, д. 12, кв. 45",
      "people_inside": "неизвестно"
    }
  },
  "expected_result": {
    "final_state": {
      "event_type_id": 1,
      "incident_address": "г. Москва, ул. Лесная, д. 12, кв. 45"
    },
    "required_actions": [
      {"action_type": "INCOMING_CALL_ANSWERED"},
      {
        "action_type": "INCOMING_CALL_DIALOGUE_EVALUATED",
        "parameters": {
          "expected_transcript": {
            "language": "ru",
            "reference_text": "Что произошло? Назовите точный адрес. Есть ли люди в квартире?"
          }
        }
      },
      {"action_type": "INCIDENT_CARD_CREATED_FROM_CALL"},
      {"action_type": "INCOMING_CALL_COMPLETED"}
    ]
  },
  "created_by": "teacher-uuid"
}
```

`context` не возвращается в runtime-ответе обучаемому; его будет читать серверный
оркестратор LLM/STT/TTS.

## Список сценариев

```http
GET /api/v1/training-scenarios?status=DRAFT&difficulty=2&include_archived=false
GET /api/v1/training-scenarios/{scenarioId}
```

Статусы: `DRAFT`, `PUBLISHED`, `ARCHIVED`. Без `status` архивные сценарии скрыты,
если не передан `include_archived=true`.

## Создать сценарий

```http
POST /api/v1/training-scenarios
Content-Type: application/json

{
  "name": "Одиночная тренировка",
  "description": null,
  "difficulty": 2,
  "estimated_duration_seconds": 600,
  "workspace_mode": "INDIVIDUAL",
  "completion_policy": "STUDENT_CONFIRM",
  "min_participants": 1,
  "max_participants": 1,
  "status": "DRAFT",
  "created_by": "teacher-uuid",
  "definition": {
    "schema_version": 1,
    "cards": [
      {
        "key": "fire-001",
        "trigger_type": "TIME_OFFSET",
        "trigger_config": {"offset_seconds": 0},
        "source_type": "TEMPLATE",
        "template_id": "template-uuid"
      }
    ]
  }
}
```

Режимы:

- `INDIVIDUAL` требует ровно одного участника (`min=max=1`);
- `SHARED` допускает заданный диапазон участников.

Политики завершения:

- `STUDENT_CONFIRM` — индивидуальная сессия завершается обучаемым после
  `can_complete=true`; значение по умолчанию для `INDIVIDUAL`;
- `AUTO_WHEN_READY` — индивидуальная сессия автоматически завершается worker,
  как только выпущены все карточки и получены все требуемые решения служб;
- `TEACHER_ONLY` — обязательная политика для `SHARED`, завершает инструктор.

При смене `workspace_mode` в draft-сценарии без явного `completion_policy`
backend установит подходящее значение по умолчанию. Несовместимая комбинация
возвращает `422`.

Источник карточки:

- `TEMPLATE` — нужен `template_id`, поля карточки и результата не передаются;
- `INLINE` — нужны `initial_card` и `expected_result`;
- `SNAPSHOT` зарезервирован backend и в конструкторе запрещён.

Начиная со `schema_version: 2`, список `cards` является совместимым списком
элементов сценария. Старые элементы не требуют `item_type` и считаются
`INCIDENT_CARD`. Для входящего звонка укажите `item_type: INCOMING_CALL`; тогда
`template_id` относится к `incoming_call_template`:

```json
"definition": {
  "schema_version": 2,
  "cards": [
    {
      "key": "caller-fire-001",
      "item_type": "INCOMING_CALL",
      "trigger_type": "TIME_OFFSET",
      "trigger_config": {"offset_seconds": 5},
      "source_type": "TEMPLATE",
      "template_id": "incoming-call-template-uuid"
    },
    {
      "key": "dispatch-followup-001",
      "item_type": "INCIDENT_CARD",
      "trigger_type": "AFTER_ACTION",
      "trigger_config": {
        "card_key": "caller-fire-001",
        "action_type": "INCOMING_CALL_COMPLETED",
        "delay_seconds": 30
      },
      "source_type": "TEMPLATE",
      "template_id": "card-template-uuid"
    }
  ]
}
```

При назначении оба вида шаблонов разворачиваются в неизменяемые снимки. При
старте `INCIDENT_CARD` создаёт запланированную карточку, а `INCOMING_CALL` —
экземпляр `training_call`; карточка происшествия для него заранее не создаётся.
Существующее поле ответа `cards_count` сохранено для совместимости и теперь
содержит общее число элементов обоих типов.

Триггеры:

- `TIME_OFFSET` — `trigger_config.offset_seconds >= 0`;
- `AFTER_ACTION` — `card_key`, `action_type`, опциональный `delay_seconds >= 0`;
- `MANUAL` — карточку выпускает преподаватель из активной сессии.

`key` уникален внутри сценария и соответствует `[A-Za-z0-9_.-]+`. Зависимость
`AFTER_ACTION` должна ссылаться на другую существующую карточку.

## Изменить или архивировать

```http
PATCH /api/v1/training-scenarios/{scenarioId}
Content-Type: application/json

{
  "expected_revision": 1,
  "updated_by": "teacher-uuid",
  "name": "Уточнённое название"
}
```

Передавайте только изменяемые поля. После успеха `revision` увеличивается; её
новое значение нужно сохранить в состоянии формы. Изменять можно только
`DRAFT`.

```http
DELETE /api/v1/training-scenarios/{scenarioId}
Content-Type: application/json

{"deleted_by":"teacher-uuid","expected_revision":2}
```

Физического удаления нет: сценарий получает `ARCHIVED`, ответ — `204`.

## Ошибки

- `404` — шаблон или сценарий не найден;
- `409` — версия шаблона уже существует, шаблон используется, конфликт
  `revision` или попытка изменить опубликованный сценарий;
- `422` — неверная роль автора, диапазон участников, схема определения,
  ссылка на неактивный шаблон или некорректный триггер.
