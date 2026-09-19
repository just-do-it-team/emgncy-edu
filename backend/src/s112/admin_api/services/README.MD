# Вкладка «Сервисы»

`GET /api/v1/admin/services` возвращает наблюдаемые Prometheus-компоненты: имя,
instance, состояние, время последней проверки и ошибку. Интерфейс обновляет
список раз в 10–15 секунд.

Для каждой строки предусмотрены команды `start`, `stop`, `restart`:

```http
POST /api/v1/admin/services/{service_name}/actions
Content-Type: application/json

{"action":"restart"}
```

На демонстрационном стенде команды намеренно не выполняются. API возвращает
`423` с кодом `operation_disabled`, а попытка записывается в аудит с результатом
`DENIED`. Frontend должен показывать кнопки отключёнными и выводить значение
`disabled_reason` в подсказке.
