# Вкладка преподавателя «Обучаемые и группы»

Вкладка объединяет поиск доступных преподавателю обучаемых, управление группами
и назначение опубликованных сценариев. До общей авторизации UUID преподавателя
передаётся в query-параметрах или теле запроса.

## Список обучаемых

```http
GET /api/v1/students?teacher_id={teacherId}&group_id={groupId}&search=иван&limit=50&offset=0
```

Параметры:

- `teacher_id` — обязательный UUID преподавателя;
- `group_id` — оставить только активных участников конкретной группы этого
  преподавателя;
- `search` — регистронезависимый поиск по логину, имени и email, 1–100 символов;
- `include_blocked` — включить заблокированных, по умолчанию `false`;
- `limit` — 1–200, по умолчанию 50;
- `offset` — смещение, по умолчанию 0.

В список попадают активные участники групп преподавателя и обучаемые из его
прямых назначений. Ответ:

```json
{
  "items": [
    {
      "id": "student-uuid",
      "username": "student.01",
      "display_name": "Иван Иванов",
      "is_blocked": false,
      "groups": [{"id": "group-uuid", "name": "Группа 101"}]
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

Поиск желательно выполнять с debounce. Для переключения страниц используйте
`total`, а не длину текущего `items`.

## Группы

```http
GET /api/v1/learning-groups?teacher_id={teacherId}&active_only=true
GET /api/v1/learning-groups/{groupId}
```

`LearningGroupResponse` содержит `id`, название, описание, владельца, признак
активности, даты и `members`. У удалённого из группы участника `removed_at` не
равен `null`; список обучаемых выше включает только активное членство.

Создание группы:

```http
POST /api/v1/learning-groups
Content-Type: application/json

{
  "name": "Группа 101",
  "description": "Осенний поток",
  "teacher_id": "teacher-uuid",
  "student_ids": ["student-uuid"]
}
```

Изменение группы:

```http
PATCH /api/v1/learning-groups/{groupId}
Content-Type: application/json

{
  "actor_id": "teacher-uuid",
  "name": "Новое название",
  "description": "Новое описание",
  "is_active": true
}
```

Передавайте только изменяемые поля. `is_active=false` архивирует группу; отдельного
DELETE нет.

Состав группы:

```http
POST /api/v1/learning-groups/{groupId}/members
Content-Type: application/json

{"actor_id":"teacher-uuid","student_ids":["student-uuid"]}
```

Добавление ранее удалённого участника восстанавливает членство.

```http
DELETE /api/v1/learning-groups/{groupId}/members/{studentId}?actor_id={teacherId}
```

Успех удаления возвращает `204` без тела.

## Назначить сценарий группе

```http
POST /api/v1/learning-groups/{groupId}/scenario-assignments
Content-Type: application/json

{
  "scenario_id": "scenario-uuid",
  "assigned_by": "teacher-uuid",
  "participant_ids": ["student-112-uuid", "student-dds-uuid"],
  "participant_positions": {
    "student-112-uuid": null,
    "student-dds-uuid": "101"
  },
  "incoming_call_operators": {"call-1": "student-112-uuid"},
  "launch_policy": "TEACHER_START",
  "max_attempts": 2
}
```

`participant_ids` выбирает часть действующих участников группы. Если поле
отсутствует, для совместимости выбираются все активные участники. Пустой
список и повторы запрещены. `participant_positions` должен содержать ровно
выбранных обучаемых: код активной службы означает роль `DDS`, а `null` — роль
`OPERATOR_112`. Одна позиция ДДС может быть занята только одним участником.
Распределение задаётся при назначении, а не в шаблоне сценария.

Для `INDIVIDUAL` backend создаёт отдельное назначение каждому выбранному
участнику и требует `STUDENT_SELF_START`. Для `SHARED` создаётся одно общее
назначение и требуется `TEACHER_START`. Число выбранных участников должно
попадать в диапазон сценария. Если в нём есть входящие звонки, нужен хотя бы
один `OPERATOR_112`. При нескольких операторах укажите в
`incoming_call_operators` оператора для **каждого** входящего звонка по ключу
элемента сценария; при одном операторе backend назначит его автоматически.

Ответ `AssignmentBatchResponse` содержит `participant_ids` выбранных
обучаемых и созданные `assignments` с `participants`, `position_code` и
`participant_role`. Именно этот состав подтверждает готовность и запускает
общий сценарий; роли фиксируются в назначении и рабочем пространстве.

`available_from` и `due_at` необязательны при групповом и прямом назначении.
Если `available_from` не передан или равен `null`, занятие доступно с момента
назначения. Если `due_at` не передан или равен `null`, срок выполнения наступает
через 7 дней после `available_from`. Оба поля можно задать явно в формате
ISO 8601; `due_at` должен быть позже `available_from`. Ответы содержат
рассчитанные значения обоих полей.

## Прямое назначение

```http
POST /api/v1/scenario-assignments
Content-Type: application/json

{
  "scenario_id": "scenario-uuid",
  "participant_ids": ["student-uuid"],
  "participant_positions": {"student-uuid": "101"},
  "assigned_by": "teacher-uuid",
  "launch_policy": "STUDENT_SELF_START",
  "max_attempts": 1
}
```

Назначать можно только сценарий со статусом `PUBLISHED`.
`participant_positions` обязателен для каждого участника. Для ДДС укажите
код активной экстренной службы, для оператора 112 — `null`. В ответе каждого
участника есть `participant_role` (`DDS` или `OPERATOR_112`). Набор должен
покрывать `required_participant_positions` сценария; иначе backend вернёт
`422` с перечнем отсутствующих позиций.

```http
GET /api/v1/scenario-assignments?assigned_by={teacherId}&group_id={groupId}&status=ASSIGNED
X-User-Id: <teacherId>
```

Общий метод списка можно использовать для экрана назначений преподавателя.
Каждое назначение содержит `scenario_name` и `passing_score` из зафиксированной
версии сценария, а также рассчитанные `available_from` и `due_at`. Для
группового назначения возвращаются `group_id` и текущее `group_name`; для
назначения без пакета оба значения равны `null`. У ранее
созданных назначений временные поля могут быть `null`; для старых snapshots без
порога возвращается `passing_score=100`.

Список ограничен назначениями этого преподавателя; администратор может читать
все, а обучаемый — только назначения, в которых он участвует. При включённой
проверке JWT значение `X-User-Id` должно совпадать с токеном.

## Перенос срока и отмена назначения

Передайте `X-User-Id: <teacherId>` преподавателя, создавшего назначение.
При включённой проверке JWT этот ID должен совпадать с токеном.

```http
PATCH /api/v1/scenario-assignments/{assignmentId}
Content-Type: application/json
X-User-Id: <teacherId>

{"available_from": "2026-10-01T09:00:00Z", "due_at": "2026-10-08T09:00:00Z"}
```

Можно передать одно из полей; второе сохранится. `null` и пустой объект
недопустимы. Новый дедлайн должен быть позже начала и находиться в будущем.
Ответ — обновлённый `ScenarioAssignmentResponse`.

Для назначения из пакета используйте `PATCH /api/v1/assignment-batches/{batchId}`
с тем же заголовком и телом. Он меняет сроки всех назначений пакета одной
операцией и возвращает `AssignmentBatchResponse`.

Отмена выполняется через `DELETE /api/v1/scenario-assignments/{assignmentId}`
или `DELETE /api/v1/assignment-batches/{batchId}` с `X-User-Id: <teacherId>`.
Оба метода возвращают `204`, в том числе при повторной отмене. Записи остаются
в истории со статусом `CANCELLED`; пакет отменяется целиком.

Перенос и отмена допустимы только до первой попытки. При наличии попытки,
текущем выполнении или завершении API возвращает `409`. Назначение из пакета
изменяется и отменяется только через маршрут пакета.

## Ошибки

- `403` — `teacher_id` в списке принадлежит не преподавателю/администратору;
- `404` — преподаватель, группа или сценарий не найдены;
- `409` — повтор имени группы или действие над архивной группой;
- `422` — чужая группа, неверная роль участника, неопубликованный сценарий,
  неверное число участников/позиция либо некорректный период назначения.
