# Занятия

Статус: реализовано на существующих ручках, дельты — в «Требуется на бэкенде»
Потребитель на фронте: `features/teacher-lessons`; экраны «Обзор», «Занятия», «Результаты занятия»
Связанные файлы фронта: `frontend/src/features/teacher-lessons/**`,
`frontend/src/entities/{assignment,group,monitoring}/**`,
`frontend/src/pages/{teacher-overview,teacher-lessons,teacher-lesson-results}/**`,
`frontend/src/widgets/teacher-attempts-table/**`

## Назначение

Отдельной сущности «занятие» на бэкенде нет и не будет: занятие — это назначенный сценарий.
Назначения одной группе, созданные одним действием, объединены пакетом
(`assignment_batch_id`); пакет и считается занятием. Назначение без пакета — занятие из одного
назначения. Ручки чтения пакета нет, фронт собирает занятие на клиенте.

Ранее описанные здесь `GET /api/v1/lessons`, `GET /api/v1/lessons/{id}`,
`GET /api/v1/lessons/{id}/summary` и `GET /api/v1/lessons/{id}/results` сняты: их не будет.
Выдуманный слой фронта на них удалён.

## Ручки

### GET /api/v1/scenario-assignments
Назначение: назначения преподавателя.
Отношение к существующему: существующая (`backend/src/s112/api/common/training/assignments.py:16`).
Query: `assigned_by` — преподаватель; `group_id` — назначения пакетов этой группы.
Ответ: голый массив `ScenarioAssignmentResponse`: `id`, `scenario_id`, `scenario_name`,
`assignment_batch_id`, `status` (`ASSIGNED`, `RUNNING`, `COMPLETED`, `CANCELLED`, `EXPIRED`),
`available_from`, `due_at`, `created_at`, `participants[]`. Поля `group_id` в ответе нет.
Доступ: **проверки нет**.

### GET /api/v1/learning-groups
Назначение: группы преподавателя с составом. Query: `teacher_id`, `active_only`.

### GET /api/v1/teacher-monitoring/sessions
Назначение: сессии преподавателя. Query: `teacher_id`; `status` — по умолчанию `RUNNING`,
пустое значение отдаёт все статусы.
Ответ: `session_id`, `assignment_id`, `assignment_batch_id`, `group_name`, `scenario_name`,
`status`, `started_at`, `completed_at`, `score` (строка-десятичное), `passed`,
`participants[]` с `display_name` и `participant_role`.

## Как фронт собирает занятие

1. `scenario-assignments?assigned_by=` — все назначения преподавателя.
2. `learning-groups?teacher_id=`, затем `scenario-assignments?assigned_by=&group_id=` на каждую
   группу — так пакет получает название группы (N+1 запрос).
3. Назначения группируются по `assignment_batch_id`, без пакета — по `id`.
4. Состояние занятия сводится из статусов назначений: все `CANCELLED` — отменено; есть
   `RUNNING` — идёт; все из `COMPLETED`, `EXPIRED`, `CANCELLED` — завершено; иначе
   запланировано.
5. Попытки занятия — завершённые сессии монитора, чей `assignment_id` входит в занятие.
6. Средний балл и доля зачётов считаются на клиенте по уже выставленным сервером `score` и
   `passed` и подписываются «среднее по N показанным попыткам». Балл попытки не
   пересчитывается. Нет оценённых попыток — «нет данных», а не ноль.

Нормативы (30 с подтверждения, 180 с обработки) фиксированы, берутся из
`shared/config/time-norms.ts`.

Страница занятия дополнительно показывает из `ScenarioAssignmentResponse` политику запуска
`launch_policy`, число попыток `max_attempts`, ревизию `scenario_revision` и участников
`participants[]` (роль, позиция ДДС, статус, `ready_at`, `completed_at`). Попытки участника
считаются так же, как на сервере: число сессий назначения из монитора против `max_attempts`.
Сценарий занятия читается из `GET /training-scenarios/{id}` — это текущая ревизия, а не
снимок назначения: при расхождении `revision` и `scenario_revision` страница предупреждает.

Отчёт по занятию формируется на клиенте в PDF из тех же данных: сводка занятия, разборы
завершённых попыток и таблица попыток.

## Кэшируемость

Назначения и группы — полусправочники: 5 мин / 30 мин. Сессии монитора — список: 30 с / 5 мин.

## Требуется на бэкенде

| Приоритет | Что реализовать | Что сейчас в интерфейсе |
|---|---|---|
| P0 | Проверка доступа в `GET /scenario-assignments` | назначения любого преподавателя читаются по его id |
| P1 | `group_id` и `group_name` в `ScenarioAssignmentResponse` или ручка чтения пакета | группа пакета ищется N+1 запросом |
| P1 | Сводка занятия: средний балл, доля зачётов, разбивка по критериям и классам ошибок | среднее и доля считаются на клиенте, критериев и классов ошибок в сводке нет |
| P2 | `scenario_snapshot` назначения в ответе (или ручка чтения снимка) | состав на странице занятия берётся из текущей ревизии сценария; при другой ревизии показано предупреждение |
