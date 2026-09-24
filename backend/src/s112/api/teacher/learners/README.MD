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
  "participant_positions": {"student-uuid": "101"},
  "launch_policy": "STUDENT_SELF_START",
  "max_attempts": 2,
  "available_from": "2026-09-21T09:00:00Z",
  "due_at": "2026-09-28T18:00:00Z"
}
```

Для `INDIVIDUAL` backend создаёт отдельное назначение каждому участнику и
требует `STUDENT_SELF_START`. Для `SHARED` создаётся одно общее назначение и
требуется `TEACHER_START`. Ответ `AssignmentBatchResponse` содержит созданные
назначения в `assignments`. `participant_positions` должен содержать запись
для каждого действующего участника группы: код активной службы означает роль
`DDS`, а `null` — роль `OPERATOR_112`. По кодам служб backend определяет
обязательные для решения карточки и готовность завершения.

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
  "max_attempts": 1,
  "available_from": null,
  "due_at": null
}
```

Назначать можно только сценарий со статусом `PUBLISHED`.
`participant_positions` обязателен для каждого участника. Для ДДС укажите
код активной экстренной службы, для оператора 112 — `null`. В ответе каждого
участника есть `participant_role` (`DDS` или `OPERATOR_112`).

```http
GET /api/v1/scenario-assignments?assigned_by={teacherId}&group_id={groupId}&status=ASSIGNED
```

Общий метод списка можно использовать для экрана назначений преподавателя.
Каждое назначение содержит `scenario_name` из зафиксированной версии сценария
и `due_at` (`null`, если срок не был задан).

## Ошибки

- `403` — `teacher_id` в списке принадлежит не преподавателю/администратору;
- `404` — преподаватель, группа или сценарий не найдены;
- `409` — повтор имени группы или действие над архивной группой;
- `422` — чужая группа, неверная роль участника, неопубликованный сценарий,
  неверное число участников/позиция либо некорректный период назначения.
