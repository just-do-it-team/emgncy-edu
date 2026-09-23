# Auth API

Локальный сервис аутентификации для `card-api` и `admin-api`. Сервис проверяет
пароль существующей записи `user_account`, обновляет `last_login_at` и выпускает
подписанный JWT access token.

## Настройка

- `S112_AUTH_JWT_SECRET` — общий секрет длиной не менее 32 байт;
- `S112_AUTH_JWT_ISSUER` — издатель токена, по умолчанию `s112-auth`;
- `S112_AUTH_JWT_AUDIENCE` — получатель токена, по умолчанию `s112-api`;
- `S112_AUTH_ACCESS_TOKEN_TTL_SECONDS` — срок действия, по умолчанию 3600 секунд;
- `S112_AUTH_ENABLED` — включает обязательную проверку JWT в `card-api` и
  `admin-api`; по умолчанию `false`.

Один и тот же JWT-секрет должен быть передан `auth-api`, `card-api` и
`admin-api`. Секрет нельзя хранить во frontend-коде или передавать пользователю.

## POST `/api/v1/auth/login`

Тело запроса:

```json
{
  "username": "teacher",
  "password": "user-password"
}
```

Успешный ответ `200 OK`:

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": "2026-09-22T13:00:00Z",
  "user": {
    "id": "a4d99c61-faa5-48dd-9e8e-e92984d2765b",
    "username": "teacher",
    "display_name": "Преподаватель",
    "email": "teacher@example.local",
    "role": "TEACHER",
    "is_blocked": false,
    "last_login_at": "2026-09-22T12:00:00Z",
    "created_at": "2026-09-01T12:00:00Z",
    "updated_at": "2026-09-22T12:00:00Z"
  }
}
```

Frontend передаёт токен последующим сервисам в заголовке:

```http
Authorization: Bearer eyJ...
```

Ошибки:

- `401` — неправильный логин или пароль;
- `403` — учётная запись заблокирована;
- `422` — запрос не соответствует схеме;
- `503` — общий JWT-секрет не настроен.

Access token содержит `sub`, `username`, `role`, `iss`, `aud`, `iat`, `nbf`,
`exp` и `jti`. При включённой защите сервис повторно загружает пользователя из
БД, поэтому блокировка и изменение роли применяются без ожидания окончания
срока токена.

## Профиль, продление и выход

Все три метода принимают `Authorization: Bearer <access_token>` независимо от
`S112_AUTH_ENABLED`. Подпись и срок токена проверяются, профиль берётся по `sub`
из актуальной записи пользователя; заблокированный пользователь получает `403`.

- `GET /api/v1/auth/profile` — возвращает объект `user` из ответа login.
- `POST /api/v1/auth/refresh` — без тела, возвращает новый ответ формата login.
  Старый access token отзывается; клиент должен заменить его новым до истечения
  текущего часа.
- `POST /api/v1/auth/logout` — без тела, отзывает текущий access token и
  возвращает `204 No Content`.

Отозванные токены записываются в `revoked_access_token` вместе с `expires_at`.
Для таблицы требуется миграция Alembic `0011`. Пока `S112_AUTH_ENABLED=false`,
отзыв проверяется сервисом auth, но остальные сервисы продолжают принимать
запросы по своему тестовому контракту без проверки JWT.
