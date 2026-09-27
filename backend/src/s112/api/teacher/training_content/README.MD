# Вкладка преподавателя «Сценарии обучения»

Вкладка состоит из конструктора шаблонов карточек и конструктора сценариев.
Изменение опубликованного сценария запрещено: редактируется только `DRAFT`.

## Контракт шаблонов для frontend

Backend хранит два разных вида шаблонов. Их нельзя смешивать в одной форме или
отправлять в одну ручку:

| Назначение | Сущность | Создание | Начальные данные |
|---|---|---|---|
| Готовая карточка для оператора ДДС, в том числе с исходящим звонком | `card_template` | `POST /api/v1/card-templates` | `initial_card` |
| Входящий звонок заявителя оператору 112, по итогам которого обучаемый создаёт карточку | `incoming_call_template` | `POST /api/v1/incoming-call-templates` | `initial_call` |

При включённой авторизации frontend передаёт обычный `Authorization: Bearer
<token>`. В поле `created_by` всегда передаётся `id` текущего преподавателя из
его профиля. Для `GET`-методов шаблонов дополнительно обязателен заголовок
`X-User-Id` с тем же идентификатором преподавателя.

Шаблоны неизменяемы. Для первой версии `template_key` можно не передавать или
передать `null`: backend создаст ключ. Новая версия создаётся новым `POST` с тем
же `template_key` и увеличенным `version`. Физического редактирования шаблона
нет; `DELETE` деактивирует конкретную версию.

### Общие типы данных

Ниже приведены TypeScript-типы, повторяющие JSON-контракт API. Имена полей
нужно отправлять именно в `snake_case`.

```ts
type UUID = string;
type JsonValue = null | boolean | number | string | JsonValue[] | {
  [key: string]: JsonValue;
};

type CardStatus =
  | "REGISTERED"
  | "PROCESSED"
  | "CHECKED"
  | "NOT_NOTIFIED"
  | "REFUSAL"
  | "NOT_COMPLETED"
  | "COMPLETED";

type ServiceResponseStatus =
  | "ADDED"
  | "NOT_NOTIFIED"
  | "RECEIVED"
  | "ACCEPTED"
  | "REJECTED"
  | "RESPONSE_STARTED"
  | "ARRIVED"
  | "WORK_IN_PROGRESS"
  | "WORK_COMPLETED"
  | "WORK_REFUSED";

type Questionnaire = {
  questions: string;
  answers: string;
};

type Classification = {
  record_id: number;
  group_code: number;
  feature_1_code: number;
  feature_2_code: number;
  feature_3_code: number;
  final_incident_type: string;
  routing_flags: Record<string, boolean>;
  excluded_service_codes: string[];
};

type InitialCard = {
  classification: Classification;
  source_type?: "CALL" | "SMS" | "VIS" | "ERA_GLONASS" | "REGIONAL_112" | "MANUAL";
  description?: string;
  questionnaire?: Questionnaire | null;
  applicant_full_name?: string | null;
  automatic_phone_number?: string | null;
  provided_phone_number?: string | null;
  location_phone_number?: string | null;
  reported_address?: string | null;
  incident_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  victims_count?: number | null;
};

type ExpectedCard = {
  classification: Classification;
  description: string;
  questionnaire: Questionnaire | null;
  applicant_full_name: string | null;
  automatic_phone_number: string | null;
  provided_phone_number: string | null;
  location_phone_number: string | null;
  reported_address: string | null;
  incident_address: string | null;
  victims_count: number | null;
  current_status: CardStatus;
  services: string[];
  service_statuses: Record<string, ServiceResponseStatus>;
};

type OutboundCall = {
  expected_text: string;
  minimum_similarity?: number; // 0..1, по умолчанию 0.8
};

type ExpectedServiceStatusChange = {
  status: ServiceResponseStatus;
  comment: string | null;
  unit_number: string | null; // номер реагирующего подразделения, максимум 64 символа
};

type ExpectedResult = {
  card: ExpectedCard;
  outbound_call?: OutboundCall | null;
  service_status_history?: Record<string, ExpectedServiceStatusChange[]> | null;
};
```

В `InitialCard` frontend не должен отправлять runtime-поля `workspace_id` и
`request_id`. Даже если они будут переданы, при сохранении шаблона backend их
удалит. Для конструктора достаточно полей, перечисленных выше.

`ExpectedCard` — полное эталонное состояние карточки после действий
обучаемого. Для предсказуемого состояния формы frontend должен явно отправлять
все его поля, включая значения `null`, пустые `services: []` и
`service_statuses: {}`. Backend сравнивает итоговую карточку с этим объектом.

Правила общих полей:

- `classification` содержит номер записи, коды группы и трёх признаков,
  итоговый тип, флаги маршрутизации и исключённые службы. Backend сверяет
  `record_id`, четыре кода и итоговый тип с
  `incident_classifier_reference.json` при сохранении шаблона, а также
  при создании сценария или назначения из шаблона;
- справочник классификатора описывает происшествия и маршруты, а не учебные
  шаблоны. Его `response_scenario` не является учебным `training_scenario`;
- `expected_result.card.services` содержит уникальные коды действующих служб;
  ключи `service_statuses` должны совпадать с этим списком, а исключённая
  классификацией служба не может входить в итоговый список. Коды в
  `excluded_service_codes` должны существовать в справочнике служб;
- `initial_card` не содержит отдельного списка служб: связанные службы для
  выпущенной учебной карточки берутся из `expected_result.card.services`.
  Условные `routes` справочника нельзя приравнивать к этому списку, потому
  что обучаемый может добавить службу вручную;
- `victims_count` — целое число `>= 0` либо `null`;
- `latitude` находится в диапазоне `-90..90`, `longitude` — `-180..180`;
- `services` содержит коды служб, например `"101"`, а не UUID служб;
- ключи `service_statuses` также являются кодами служб;
- `questionnaire` либо `null`, либо объект строго с двумя строками
  `questions` и `answers`;
- неизвестные поля в `ExpectedCard`, `Classification`, `OutboundCall` и элементах
  истории статусов дают `422`.

### Шаблон входящего звонка оператору 112

Запрос создания:

```ts
type IncomingCallTemplateCreate = {
  template_key?: UUID | null;
  version?: number; // целое >= 1, по умолчанию 1
  name: string; // 1..255 символов
  description?: string | null;
  difficulty?: number; // целое 1..5, по умолчанию 1
  initial_call: {
    initial_utterance: string; // 1..10000 символов после trim
    automatic_phone_number?: string | null; // АОН, максимум 64 символа
  };
  expected_result: ExpectedResult;
  created_by: UUID;
};
```

Для входящего звонка действуют дополнительные правила:

- `expected_result.card` обязателен;
- `initial_call.initial_utterance` — затравка истории диалога для модели;
  сама по себе не озвучивается после ответа на звонок;
- достоверные обстоятельства происшествия задаются в `expected_result.card`;
  dialogue worker передаёт этот эталонный объект модели как закрытый контекст;
- ФИО заявителя, названный им номер для обратной связи и телефон по месту
  происшествия задаются только в `expected_result.card` полями
  `applicant_full_name`, `provided_phone_number` и `location_phone_number`.
  Эти поля не входят в `initial_call` и становятся известны обучаемому только
  из голосовых ответов модели; после разговора обучаемый переносит их в карточку;
- `initial_call.automatic_phone_number` — отображаемый оператору АОН. Он не
  заменяет номера, которые заявитель сообщает голосом;
- разговор и формулировки вопросов обучаемого не оцениваются — оценивается
  только созданная по итогам разговора карточка;
- `outbound_call` для входящего звонка не передаётся: используйте `null` или
  не включайте поле;
- `service_status_history` для оператора 112 не передаётся: используйте `null`
  или не включайте поле;
- обычно новая карточка остаётся в состоянии `REGISTERED`; состав `services` и
  `service_statuses` задаётся ровно таким, каким он должен быть после её
  сохранения в конкретном учебном сценарии.

Канонический запрос:

```http
POST /api/v1/incoming-call-templates
Content-Type: application/json

{
  "template_key": null,
  "version": 1,
  "name": "Оператор 112: дым в подъезде",
  "description": "Заявитель сообщает о дыме; оператор должен уточнить адрес и пострадавших",
  "difficulty": 2,
  "initial_call": {
    "initial_utterance": "Алло, помогите, в подъезде сильный запах дыма!"
  },
  "expected_result": {
    "card": {
      "classification": {"record_id": 1050102, "group_code": 1, "feature_1_code": 5, "feature_2_code": 1, "feature_3_code": 2, "final_incident_type": "задымление: квартира", "routing_flags": {}, "excluded_service_codes": []},
      "description": "В подъезде жилого дома сильный запах дыма, на втором этаже горит электрощит.",
      "questionnaire": null,
      "reported_address": "г. Москва, ул. Учебная, д. 12, подъезд 2",
      "incident_address": "г. Москва, ул. Учебная, д. 12, подъезд 2",
      "victims_count": 1,
      "current_status": "REGISTERED",
      "services": [],
      "service_statuses": {}
    },
    "outbound_call": null,
    "service_status_history": null
  },
  "created_by": "teacher-uuid"
}
```

### Шаблон карточки ДДС с исходящим звонком и статусами

Запрос создания:

```ts
type CardTemplateCreate = {
  template_key?: UUID | null;
  version?: number; // целое >= 1, по умолчанию 1
  name: string; // 1..255 символов
  description?: string | null;
  difficulty?: number; // целое 1..5, по умолчанию 1
  initial_card: InitialCard;
  expected_result: ExpectedResult;
  created_by: UUID;
};
```

Для учебной карточки ДДС с телефонным оповещением:

- `initial_card` задаёт состояние карточки в момент её получения обучаемым;
- `expected_result.card` задаёт состояние после исправления карточки и
  завершения работы;
- `expected_result.outbound_call.expected_text` содержит смысловой эталон
  сообщения руководителю группы реагирования; обычно это краткая суть
  происшествия и полный адрес;
- `minimum_similarity` — число `0..1`, рекомендуемое значение `0.8`;
- длина `expected_text` — `1..10000` символов после удаления пробелов по краям;
- длина каждого комментария — не более `10000` символов; пустая строка после
  `trim` сохраняется как `null`;
- `unit_number` — номер назначенного расчёта, экипажа или бригады длиной до
  `64` символов. Поле может быть `null`, например до начала реагирования;
- `service_status_history` задаёт точный ожидаемый порядок изменений статуса и
  комментарии оператора;
- множество ключей `service_status_history` должно в точности совпадать с
  множеством кодов в `expected_result.card.services`;
- история каждой службы должна быть непустой;
- последний статус истории службы должен совпадать со значением
  `expected_result.card.service_statuses[serviceCode]`;
- при оценке сравниваются порядок, статус и точный текст комментария;
  `unit_number` сохраняется в истории, но на оценку не влияет;
- для сценария одной ДДС в `services`, `service_statuses` и
  `service_status_history` должен присутствовать только код этой ДДС.

Статус `ADDED` является внутренним начальным состоянием назначения службы и в
историю действий обучаемого обычно не включается. Допустимые переходы:

```text
ADDED -> NOT_NOTIFIED | RECEIVED | ACCEPTED | REJECTED
NOT_NOTIFIED -> RECEIVED | ACCEPTED | REJECTED
RECEIVED -> ACCEPTED | REJECTED
REJECTED -> ACCEPTED
ACCEPTED -> RESPONSE_STARTED | WORK_REFUSED
RESPONSE_STARTED -> ARRIVED | WORK_REFUSED
ARRIVED -> WORK_IN_PROGRESS | WORK_REFUSED
WORK_IN_PROGRESS -> WORK_COMPLETED | WORK_REFUSED
WORK_COMPLETED -> конец
WORK_REFUSED -> конец
```

Комментарий обязателен backend-ом для `REJECTED` и `WORK_REFUSED`. Для
актуальных учебных шаблонов frontend должен также требовать непустой комментарий
для всех действий после `RECEIVED`, поскольку комментарии входят в эталон и
сравниваются дословно.

Каноническая успешная последовательность для текущих шаблонов ДДС:

```text
RECEIVED -> ACCEPTED -> RESPONSE_STARTED -> ARRIVED
-> WORK_IN_PROGRESS -> WORK_COMPLETED
```

Канонический запрос:

```http
POST /api/v1/card-templates
Content-Type: application/json

{
  "template_key": null,
  "version": 1,
  "name": "ДДС-101: горение мусора и доклад пожарной бригаде",
  "description": "Исправить число пострадавших, выполнить звонок и провести статусы службы",
  "difficulty": 2,
  "initial_card": {
    "source_type": "CALL",
    "classification": {"record_id": 1010101, "group_code": 1, "feature_1_code": 1, "feature_2_code": 1, "feature_3_code": 1, "final_incident_type": "пожар: мусор", "routing_flags": {}, "excluded_service_codes": []},
    "description": "Во дворе у контейнерной площадки горит мусор открытым пламенем. Люди не пострадали.",
    "questionnaire": null,
    "reported_address": "г. Москва, ул. Учебная, д. 10",
    "incident_address": "г. Москва, ул. Учебная, д. 10, контейнерная площадка",
    "victims_count": 1
  },
  "expected_result": {
    "card": {
      "classification": {"record_id": 1010101, "group_code": 1, "feature_1_code": 1, "feature_2_code": 1, "feature_3_code": 1, "final_incident_type": "пожар: мусор", "routing_flags": {}, "excluded_service_codes": []},
      "description": "Во дворе у контейнерной площадки горит мусор открытым пламенем. Люди не пострадали.",
      "questionnaire": null,
      "reported_address": "г. Москва, ул. Учебная, д. 10",
      "incident_address": "г. Москва, ул. Учебная, д. 10, контейнерная площадка",
      "victims_count": 0,
      "current_status": "COMPLETED",
      "services": ["101"],
      "service_statuses": {
        "101": "WORK_COMPLETED"
      }
    },
    "outbound_call": {
      "expected_text": "Горение мусора на контейнерной площадке по адресу: г. Москва, ул. Учебная, д. 10, контейнерная площадка.",
      "minimum_similarity": 0.8
    },
    "service_status_history": {
      "101": [
        {
          "status": "RECEIVED",
          "comment": null
        },
        {
          "status": "ACCEPTED",
          "comment": "Карточка принята. Пожарный расчёт направлен к месту происшествия."
        },
        {
          "status": "RESPONSE_STARTED",
          "comment": "Пожарный расчёт выехал к месту происшествия."
        },
        {
          "status": "ARRIVED",
          "comment": "Пожарный расчёт прибыл по указанному адресу."
        },
        {
          "status": "WORK_IN_PROGRESS",
          "comment": "Пожарный расчёт приступил к работе на месте."
        },
        {
          "status": "WORK_COMPLETED",
          "comment": "Работы службы 101 на месте происшествия завершены."
        }
      ]
    }
  },
  "created_by": "teacher-uuid"
}
```

### Ответы API и загрузка шаблона в форму

Обе ручки создания возвращают `201` и сохранённый объект:

```ts
type TemplateResponse<TInitial> = {
  id: UUID;             // UUID конкретной версии, используется в scenario.template_id
  template_key: UUID;   // стабильный ключ семейства версий
  version: number;
  name: string;
  description: string | null;
  difficulty: number;
  initial_card?: TInitial;
  initial_call?: { initial_utterance: string };
  expected_result: ExpectedResult;
  is_active: boolean;
  created_by: UUID;
  created_at: string;   // ISO 8601
};
```

Для заполнения формы существующими данными используйте:

```http
GET /api/v1/card-templates?active_only=true
X-User-Id: <teacher-uuid>

GET /api/v1/card-templates/{templateId}
X-User-Id: <teacher-uuid>

GET /api/v1/incoming-call-templates?active_only=true
X-User-Id: <teacher-uuid>

GET /api/v1/incoming-call-templates/{templateId}
X-User-Id: <teacher-uuid>
```

В сценарий передаётся поле `id` конкретной версии шаблона, а не
`template_key`. Для входящего звонка элемент сценария имеет
`item_type: "INCOMING_CALL"`; для карточки ДДС —
`item_type: "INCIDENT_CARD"`.

Основные ошибки сохранения:

- `422` — структура не соответствует схеме, классификация не совпадает с
  записью справочника, указана неизвестная/неактивная служба, нарушена
  последовательность статусов, не совпадают службы или финальный статус,
  неверна роль автора;
- `403` — при включённой авторизации `created_by`, `deleted_by` или
  `X-User-Id` не совпадает с пользователем из JWT;
- `409` — такая пара `template_key + version` уже существует;
- `404` — запрошенная версия шаблона не найдена.

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
    "classification": {"record_id": 1050102, "group_code": 1, "feature_1_code": 5, "feature_2_code": 1, "feature_3_code": 2, "final_incident_type": "задымление: квартира", "routing_flags": {}, "excluded_service_codes": []},
    "source_type": "CALL",
    "description": "Дым из окна",
    "incident_address": "Учебный адрес",
    "victims_count": 0
  },
  "expected_result": {
    "card": {
      "classification": {"record_id": 1050101, "group_code": 1, "feature_1_code": 5, "feature_2_code": 1, "feature_3_code": 1, "final_incident_type": "пожар: квартира", "routing_flags": {}, "excluded_service_codes": []},
      "description": "Пожар в жилом доме",
      "questionnaire": null,
      "reported_address": null,
      "incident_address": "Учебный адрес",
      "victims_count": 0,
      "current_status": "REGISTERED",
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
      "classification": {"record_id": 1050101, "group_code": 1, "feature_1_code": 5, "feature_2_code": 1, "feature_3_code": 1, "final_incident_type": "пожар: квартира", "routing_flags": {}, "excluded_service_codes": []},
      "description": "Пожар в квартире",
      "questionnaire": null,
      "reported_address": null,
      "incident_address": "г. Москва, ул. Лесная, д. 12, кв. 45",
      "victims_count": 0,
      "current_status": "REGISTERED",
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
`initial_card` и `expected_result` для карточки; `TEMPLATE` ссылается
на `template_id`. Входящий звонок задаётся только ссылкой на шаблон входящего
звонка и требует `schema_version >= 2`. Поле `initial_utterance` остаётся
в шаблоне звонка и в определение сценария не передаётся.

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
`initial_card` для карточки и `expected_card`. Для просмотра `initial_call`
используйте ручку шаблона входящего звонка. Сервер добавляет
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
      "key": "incoming-call-1",
      "item_type": "INCOMING_CALL",
      "trigger_type": "TIME_OFFSET",
      "trigger_config": {"offset_seconds": 5},
      "source_type": "TEMPLATE",
      "template_id": "incoming-call-template-uuid"
    },
    {
      "key": "incoming-call-2",
      "item_type": "INCOMING_CALL",
      "trigger_type": "AFTER_ACTION",
      "trigger_config": {
        "card_key": "incoming-call-1",
        "action_type": "INCOMING_CALL_COMPLETED",
        "delay_seconds": 3
      },
      "source_type": "TEMPLATE",
      "template_id": "different-incoming-call-template-uuid"
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
      "classification_group_codes": [1, 2, 3, 4]
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
- `classification_group_codes` работает как дополнительный фильтр и также должен быть
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
