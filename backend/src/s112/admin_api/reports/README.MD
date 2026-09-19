# Вкладка «Отчёты»

`GET /api/v1/admin/reports/catalog` возвращает пять пунктов вкладки:

- `usage` — созданные карточки, распределение по текущим статусам и учётные записи;
- `errors` — число ошибок по сервисам из Loki;
- `server-load` — текущие, средние и максимальные CPU, RAM, диск и сеть;
- `health` — цели и активные алерты Prometheus;
- `user-actions` — аудит действий. Отдельной вкладки аудита нет.

## Периодические отчёты

- `GET /api/v1/admin/reports/usage?start=...&end=...`;
- `GET /api/v1/admin/reports/errors?start=...&end=...`;
- `GET /api/v1/admin/reports/server-load?start=...&end=...`;
- `GET /api/v1/admin/reports/health`.

Временные метки передаются в ISO 8601 с часовым поясом. По умолчанию отчёты
использования и ошибок строятся за сутки, нагрузка — за час. Для ошибок и
нагрузки максимальный период равен 30 дням.

## Действия пользователей

`GET /api/v1/admin/reports/user-actions` поддерживает `start`, `end`, `actor_id`,
`action`, `result`, `limit`, `offset`. Результат содержит `SUCCESS`, `FAILURE`
и `DENIED`, объект действия и технические атрибуты запроса. Пароли и другие
секреты в аудит не записываются.

`GET /api/v1/admin/reports/user-actions/export` принимает те же фильтры и возвращает
CSV. Frontend должен скачивать ответ как файл. Предел строк задаётся
`ADMIN_MAX_LOG_EXPORT_ROWS`.

`502` означает недоступность Prometheus или Loki, `422` — неправильный период.
