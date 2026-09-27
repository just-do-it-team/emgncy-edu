# Попытки обучаемого

Статус: выдуманные ручки сняты; попытки читаются из существующих ручек, дельты — ниже
Потребитель на фронте: `widgets/teacher-attempts-table`, `pages/teacher-student-results`,
`pages/teacher-session-review`; старый разбор `pages/teacher-attempt-review` — на моках
Связанные файлы фронта: `frontend/src/entities/{monitoring,student,expert-review}/**`,
`frontend/src/entities/attempt/**` (моки старого разбора)

## Назначение

Попытка — это тренировочная сессия (`training_session`). Отдельной сущности «попытка» на
бэкенде нет. Ранее описанные здесь `GET /api/v1/training-sessions/{id}/attempt`,
`GET /api/v1/lessons/{id}/attempts`, `GET /api/v1/lessons/attempts?day=today`,
`GET /api/v1/students/me/attempts` и `POST /api/v1/training-sessions/{id}/attempt/review`
сняты: их не будет.

## Откуда фронт берёт попытки

| Что | Ручка | Экран |
|---|---|---|
| попытки преподавателя: сегодня, по занятию | `GET /teacher-monitoring/sessions?teacher_id=&status=` (пустой `status` — все статусы) | «Обзор», «Результаты занятия» |
| попытки одного обучаемого | `GET /students/{id}/training-history?teacher_id=` | «Обучаемые» |
| разбор попытки | `GET /training-sessions/{id}/expert-review-context` и связанные — `docs/api/attempt-replay.md` | `/teacher/attempts/{session_id}/review` |
| экспертная оценка | `PUT /training-sessions/{id}/expert-assessment` | мутация есть, экрана нет |

Полный разбор открывается только для сессии в статусе `COMPLETED`: для остальных
`expert-review-context` отвечает 409. Для прерванной сессии (`ABORTED`) фронт открывает
ограниченный разбор без расхождений с эталоном. Он собирается из
`GET /training-sessions/{id}`, `GET /training-sessions/{id}/incoming-calls` (преподаватель —
участник рабочего пространства с ролью `INSTRUCTOR`), `GET /training-sessions/{id}/scheduled-cards`,
`GET /training-sessions/{id}/actions` и назначения; расшифровка — `GET /training-calls/{id}/transcript`,
запись — `GET /training-calls/{id}/recording` только для звонков в статусе `COMPLETED`: при
прерывании идущие звонки переводятся в `CANCELLED`, и запись по ним сервер не отдаёт (409).

## Старый разбор попытки — долг

Маршруты `/teacher/attempts/{attempt_id}` и `/student/attempts/{attempt_id}` и слой
`entities/attempt` остаются на моках (`VITE_USE_MOCKS=true`), без моков слой отвечает ошибкой.
Экран показывает карточку ответа против эталона с посимвольным сравнением. Данные для него на
бэкенде есть: `expert-review-context.cards[].current_state` против `expected_result`.
Перевод на живые данные — следующий шаг. До тех пор два экрана разбора существуют параллельно;
ссылки преподавателя ведут на новый.

## Требуется на бэкенде

| Приоритет | Что реализовать | Что сейчас в интерфейсе |
|---|---|---|
| P1 | Признак «разобрано» (`expert_*`) в `TeacherMonitoringSession` | фильтра «Без разбора» в списке попыток нет |
| P1 | Разбивка балла по критериям C1–C7 и классы ошибок в результате сессии | колонки «Ошибки» в таблице попыток нет; в сводке занятия нет критериев |
| P2 | Время обработки карточки относительно норматива в сессии | колонки «Обработка» нет |
| P2 | Номер рабочего места участника | колонки «АРМ» нет |
