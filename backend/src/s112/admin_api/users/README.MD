# Вкладка «Пользователи»

Вкладка управляет локальными учётными записями. Поддерживаются роли
`ADMINISTRATOR`, `TEACHER`, `STUDENT`. Пароль принимается только при создании и
никогда не возвращается API. Он сохраняется как PBKDF2-SHA256-хеш с уникальной
солью. Все изменяющие операции атомарно записываются в `audit_event`.

## Методы

- `GET /api/v1/admin/users` — список с параметрами `search`, `role`, `is_blocked`,
  `limit`, `offset`;
- `GET /api/v1/admin/users/{id}` — карточка пользователя;
- `POST /api/v1/admin/users` — создание. Поля: `username`, `display_name`, `email`,
  `password`, `role`;
- `PATCH /api/v1/admin/users/{id}/role` — тело `{"role":"TEACHER"}`;
- `PATCH /api/v1/admin/users/{id}/block` — тело
  `{"blocked":true,"reason":"..."}`. Тем же методом выполняется разблокировка.

`409` означает конфликт логина или email, `422` — нарушение формата либо
текущей парольной политики. Поле `is_blocked` следует отображать отдельным
статусом, `blocked_at` при разблокировке становится `null`.

До подключения общей авторизации шлюз должен передавать доверенные заголовки
`X-Admin-Actor-Id`, `X-Admin-Actor-Username` и `X-Request-Id`. Напрямую
публиковать Admin API нельзя.
