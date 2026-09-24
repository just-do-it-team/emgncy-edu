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
      "additional_features": {}
    }
  },
  "expected_result": {
    "card": {
      "event_type_id": 1,
      "description": "Пожар в жилом доме",
      "questionnaire": null,
      "reported_address": null,
      "incident_address": "Учебный адрес",
      "victims_count": 0,
      "current_status": "REGISTERED",
      "features": {
        "event_kind_id": 10,
        "additional_features": {}
      },
      "services": [],
      "service_statuses": {}
    }
  },
  "created_by": "teacher-uuid"
}
```

Для первой версии `template_key` можно не передавать. Для следующей версии
передайте тот же `template_key` и новый `version`. PATCH шаблона намеренно нет:
созданная версия неизменяема.

Для нового задания `expected_result.card` задаёт полное проверяемое состояние
карточки. Поля в нём обязательны, допускают `null` там, где это допускает
карточка; неизвестные поля дают `422`. По завершении сессии они сравниваются с
фактической карточкой.

Для карточки с обязательным исходящим звонком эталонный текст и порог находятся
в `expected_result` рядом с `card`:

```json
"expected_result": {
  "card": {"...": "полное итоговое состояние карточки"},
  "outbound_call": {
    "expected_text": "Текст, смысл которого должен передать оператор",
    "minimum_similarity": 0.8
  },
  "service_status_history": {
    "101": [
      {"status": "RECEIVED", "comment": null},
      {"status": "ACCEPTED", "comment": "Карточка принята. Пожарный расчёт направлен к месту происшествия."},
      {"status": "RESPONSE_STARTED", "comment": "Пожарный расчёт выехал к месту происшествия."},
      {"status": "ARRIVED", "comment": "Пожарный расчёт прибыл по указанному адресу."},
      {"status": "WORK_IN_PROGRESS", "comment": "Пожарный расчёт приступил к работе на месте."},
      {"status": "WORK_COMPLETED", "comment": "Работы службы 101 на месте происшествия завершены."}
    ]
  }
}
```

`minimum_similarity` находится в диапазоне `0..1`. Неизвестные ключи внутри
`outbound_call` запрещены. Правило применяется только к распознанным
аудиосообщениям с направлением `OUTBOUND`.

`service_status_history` задаёт точную последовательность изменений статуса,
которые должен выполнить оператор ДДС. Учитываются только записи, созданные
участником с позицией соответствующей службы. При оценке отдельно проверяются
порядок, статус и комментарий; итоговый статус должен совпадать с
`card.service_statuses`.

Для исходящего звонка ожидаемый текст задаётся только в
`expected_result.outbound_call`.

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
хранится только стартовая реплика; `context` более не принимается. Для входящего
звонка оценивается итоговая карточка, а не вопросы и ответы в ходе разговора:

```json
{
  "name": "Очевидец пожара",
  "difficulty": 2,
  "initial_call": {
    "initial_utterance": "Алло, из окна соседней квартиры идёт дым!"
  },
  "expected_result": {
    "card": {
      "event_type_id": 1,
      "description": "Пожар в квартире",
      "questionnaire": null,
      "reported_address": null,
      "incident_address": "г. Москва, ул. Лесная, д. 12, кв. 45",
      "victims_count": 0,
      "current_status": "REGISTERED",
      "features": null,
      "services": [],
      "service_statuses": {}
    }
  },
  "created_by": "teacher-uuid"
}
```

Если по сценарию в карточке должны быть записаны вопросы и ответы, задайте
`card.questionnaire` как объект с двумя строковыми ключами `questions` и
`answers`. Это сравнение данных карточки, а не проверка аудио разговора.

## Список сценариев

`training_scenario.definition` содержит `schema_version` и непустой массив
`cards`. У каждого элемента уникальный `key`, `item_type` (`INCIDENT_CARD` или
`INCOMING_CALL`), `source_type` (`INLINE` или `TEMPLATE`) и триггер. Для
`TIME_OFFSET` нужен `trigger_config.offset_seconds >= 0`; для `AFTER_ACTION` —
существующий `card_key`, `action_type` и необязательная задержка
`delay_seconds >= 0`. `MANUAL` пока не поддерживается. `INLINE` содержит
`initial_card` либо `initial_call` и `expected_result`; `TEMPLATE` ссылается
на `template_id`. Входящие звонки требуют `schema_version >= 2`.

При назначении в `scenario_assignment.scenario_snapshot` сохраняются метаданные
сценария и разрешённая копия `definition`: ссылки на шаблоны заменяются
`source_type=SNAPSHOT`, конкретными `template_id`, `template_key`,
`template_version`, исходной карточкой/звонком и эталоном результата. Для карточки
удаляются runtime-поля `workspace_id` и `request_id`. Последующее изменение
сценария или новая версия шаблона уже назначенное задание не меняют.

```http
GET /api/v1/training-scenarios?status=DRAFT&difficulty=2&include_archived=false
X-User-Id: <teacher-or-administrator-uuid>

GET /api/v1/training-scenarios/{scenarioId}
X-User-Id: <teacher-or-administrator-uuid>
```

Детальная ручка дополнительно возвращает `items[]` для элементов статического
плана. Каждый элемент содержит `key`, `item_type`, источник и имя шаблона,
`initial_card` либо `initial_call`, а также `expected_card`. Сервер добавляет
`event_type_name` и `event_kind_name`. `notification_list` берётся из
`expected_card.services`, а первый элемент считается `main_service`. Для процедурного сценария
будущие карточки до генерации в `items[]` не перечисляются.

Статусы: `DRAFT`, `PUBLISHED`, `ARCHIVED`. Без `status` архивные сценарии скрыты,
если не передан `include_archived=true`.

Оба метода возвращают полный `definition` с эталонами и поэтому доступны только
преподавателю или администратору. Для списка назначений обучаемого используется
`GET /api/v1/student/scenario-assignments`: он возвращает безопасные метаданные
без ожидаемых результатов и правил оценки.
Чтение шаблонов карточек и входящих звонков с эталонами также требует заголовок
`X-User-Id` преподавателя или администратора.

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

## Процедурные сценарии

Начиная со `schema_version: 3`, поле `mode` принимает:

- `STATIC` — только заранее заданные элементы `cards`;
- `PROCEDURAL` — только процедурно выбранные карточки;
- `HYBRID` — статические элементы и процедурный поток одновременно.

Минимальный процедурный сценарий:

```json
"definition": {
  "schema_version": 3,
  "mode": "PROCEDURAL",
  "cards": [],
  "procedural_generation": {
    "key": "main-flow",
    "target_count": 6,
    "template_pool": {
      "template_ids": null,
      "event_type_ids": [1, 2, 3, 4]
    }
  }
}
```

Контракт пула строгий:

- `template_ids: null` или отсутствие поля — все активные шаблоны, прошедшие
  остальные фильтры;
- непустой `template_ids` — белый список UUID конкретных версий
  `card_template`;
- пустой список, повтор UUID, неизвестный, неактивный или более сложный, чем
  сценарий, шаблон дают `422`;
- `event_type_ids` работает как дополнительный фильтр и также должен быть
  непустым списком уникальных положительных целых чисел либо `null`;
- офсеты времени в `template_ids` не задаются: шаблон с фиксированным временем
  является статическим элементом `cards`.

Выбор выполняется без повторений, поэтому подходящий пул должен содержать не
меньше `target_count` шаблонов. При назначении все подходящие версии сохраняются
в snapshot, после чего изменение каталога шаблонов не влияет на сессию.

Пока используются встроенные пресеты:

| Сложность | Первый выпуск | Интервал | Максимум незавершённых карточек |
|---|---:|---:|---:|
| 1 | 5 сек | 180 сек | 1 |
| 2 | 5 сек | 120 сек | 1 |
| 3 | 5 сек | 90 сек | 2 |
| 4 | сразу | 60 сек | 3 |
| 5 | сразу | 30 сек | 4 |

В пул входят шаблоны с `difficulty`, не превышающей сложность сценария. Поля
для seed, тегов, весов и адаптивной генерации в контракт намеренно не добавлены.
`cards_count` у процедурного сценария равен `target_count`, а у гибридного —
сумме статических и процедурных элементов.

Каждая выбранная карточка получает ключ
`generated.{generator_key}.{generation_index}` и уникальную тройку
`(training_session_id, generator_key, generation_index)`. Генератор переходит в
`EXHAUSTED` после создания `target_count` карточек, но сессия остаётся
незавершимой, пока обучаемый не выполнит действия по всем выпущенным карточкам.

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
