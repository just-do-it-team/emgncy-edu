# Вкладка «Мониторинг»

Вкладка использует только заранее заданный каталог метрик. Frontend не передаёт
произвольный PromQL, поэтому через административный API нельзя выполнить
неограниченный запрос к Prometheus.

## `GET /api/v1/admin/monitoring/metrics`

Возвращает каталог графиков. Основные поля:

- `key` — стабильный идентификатор для API;
- `title` и `description` — подписи интерфейса;
- `category` — `host`, `containers`, `gpu`, `postgres`, `kafka` или `services`;
- `unit` — единица для форматирования оси и подсказок;
- `optional` — метрика может отсутствовать, например GPU без профиля `gpu`.

## `GET /api/v1/admin/monitoring/metrics/current`

Опциональный параметр `keys` содержит идентификаторы через запятую:

```text
/api/v1/admin/monitoring/metrics/current?keys=host_cpu_percent,gpu_utilization_percent
```

Ответ — массив метрик с `samples`. Пустой `samples` означает отсутствие данных,
а не нулевое значение. Рекомендуемый интервал обновления — 10–15 секунд.

## `GET /api/v1/admin/monitoring/metrics/{metric_key}/series`

Параметры:

- `start`, `end` — ISO 8601 с часовым поясом; по умолчанию последний час;
- `step_seconds` — 5–3600 секунд; без параметра API выбирает около 300 точек;
- максимальный период — 30 дней.

Каждая серия содержит набор `labels` и точки `{timestamp, value}`. Легенду нужно
строить из информативных меток (`device`, `name`, `uuid`, `datname`, `topic`).

## `GET /api/v1/admin/monitoring/targets`

Состояние источников Prometheus: `job`, `instance`, `health`, последнее время и
длительность опроса, текст ошибки и признак `optional`. Значения `health`: `up`,
`down`, `unknown`. Недоступная опциональная цель не должна менять общий статус
стенда на аварийный.

## `GET /api/v1/admin/monitoring/alerts`

Активные и ожидающие алерты Prometheus с уровнем важности, описанием и метками.

## `GET /api/v1/admin/monitoring/dashboards`

Возвращает подготовленные ссылки Grafana. `embedded` можно показывать в iframe
после настройки единой авторизации и заголовков reverse proxy. `external` следует
открывать отдельной вкладкой.

## Ошибки

- `404` — неизвестный ключ метрики;
- `422` — неправильный период, шаг или список ключей;
- `502` — Prometheus недоступен.
