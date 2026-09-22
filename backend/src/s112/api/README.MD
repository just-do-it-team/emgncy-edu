# Card API

`card-api` обслуживает карточки происшествий и учебный процесс для ролей
`STUDENT` и `TEACHER`. Базовый префикс REST API — `/api/v1`, проверка сервиса —
`GET /health`.

Подробные frontend-контракты находятся рядом с кодом соответствующих вкладок.

## Обучаемый

- [Назначенные сценарии](student/assigned_scenarios/README.MD)
- [История прохождения](student/training_history/README.MD)
- [Прохождение сценария](student/scenario_session/README.MD)
- [Аудиосообщения STT/TTS](student/audio_messages/README.MD)
- [Входящие учебные звонки](student/incoming_calls/README.MD)

## Преподаватель

- [Обучаемые и группы](teacher/learners/README.MD)
- [Сценарии обучения](teacher/training_content/README.MD)
- [Активные сессии](teacher/active_sessions/README.MD)
- [Успеваемость](teacher/performance/README.MD)

## Общие методы

Обе роли используют общие справочники, карточки происшествий, списки назначений
и данные учебных сессий из пакета `common`. Конкретные общие методы перечислены
в README тех вкладок, где они нужны frontend.

До подключения общей аутентификации идентификатор пользователя передаётся через
`X-User-Id`, `teacher_id`, `user_id`, `actor_id` или `assigned_by` в зависимости
от контракта. Frontend не должен считать эти значения механизмом безопасности.

Полная машинная схема доступна в OpenAPI запущенного сервиса: `/docs` и
`/openapi.json`.

Полный контракт SSE, включая все типы событий, фильтры, дедупликацию и
восстановление после разрыва, описан в
[`../realtime_gateway/README.MD`](../realtime_gateway/README.MD).
