# 6. Сборка и установка

Исходный код открыт и не обфусцирован: фронтенд — `frontend/` (TypeScript), бэкенд — `backend/`
(Python, C++-воркер синтеза речи — `backend/tts-worker/`).

## 6.1. Подготовка сервера

1. Linux, Docker Engine, Docker Compose v2.
2. Драйвер NVIDIA и NVIDIA Container Toolkit — для speech-api.
3. Модели в каталоге моделей (по умолчанию `backend/models`):
   - `GigaAM-v3-e2e-rnnt/` — распознавание речи;
   - `Qwen3-TTS-12Hz-0.6B-Base-Q8_0.gguf` и `mmproj-Qwen3-TTS-12Hz-0.6B-Base-F16.gguf` — синтез;
   - `refs/` — референсы голосов (`112_male.mp3`, `female.mp3`, `reference.mp3` и другие).

   Модели в репозиторий и образы не входят, их нужно разместить вручную.

4. Языковая модель: llama-server с моделью gpt-oss-20b на хосте, слушающий адрес, доступный
   контейнерам, например `--host 0.0.0.0 --port 4555`. Контейнеры обращаются к нему
   по `http://host.docker.internal:4555`.

## 6.2. Переменные окружения

| Файл | Образец | Основные переменные |
|---|---|---|
| `backend/.env` | `backend/.env.example` | Пароли PostgreSQL и репликации; адреса публикации портов (`INFRA_BIND_ADDRESS`, `APP_BIND_ADDRESS`, `ADMIN_BIND_ADDRESS`); `AUTH_ENABLED`, `AUTH_JWT_SECRET` (не короче 32 байт), срок жизни токена; параметры Kafka, SeaweedFS, речи (`SPEECH_MODELS_DIR`, `TTS_DEFAULT_VOICE_ID`, `CUDA_ARCHITECTURES`, `S112_STT_*`, `S112_TTS_*`); адрес и модель LLM (`S112_DIALOGUE_LLM_*`, `S112_SEMANTIC_EVALUATION_*`); пароль Grafana |
| `frontend/.env` | `frontend/.env.example` | Адреса API (`/student-api`, `/auth-api`, `/realtime-gateway`, `/admin-api`); для промышленной сборки `VITE_USE_MOCKS=false`, `VITE_DEMO=false`. Переменные `VITE_*` встраиваются при сборке; `VITE_*_PROXY_TARGET` используются только дев-сервером |
| `.env` (корень) | `.env.example` | `DOMAIN` и `CERTBOT_EMAIL` для сертификата; при необходимости `ROOT_SPEECH_MODELS_DIR` |

Пароли и секреты в образцах — заглушки, при установке их нужно заменить.

> **Важно.** Модуль журналов admin-api (`backend/src/s112/admin_api/logs/`) исключён из
> репозитория правилом `logs/` в `.gitignore`. Без него admin-api не запускается, а nginx,
> проксирующий на admin-api по имени, может не стартовать. Перед установкой из чистой копии
> репозитория модуль нужно восстановить. Подробнее — раздел 5.5.

## 6.3. Полный стенд с TLS (корневой `docker-compose.yaml`)

Поднимает весь бэкенд, наблюдаемость и nginx с фронтендом. Наружу открыты только порты 80 и 443,
авторизация на сервисах включена.

```shell
docker compose --env-file frontend/.env --env-file backend/.env --env-file .env up -d
docker compose --env-file frontend/.env --env-file backend/.env --env-file .env --profile tls run --rm certbot
docker compose --env-file frontend/.env --env-file backend/.env --env-file .env restart nginx
```

- До выпуска сертификата nginx отвечает 503 на всё, кроме проверки домена.
- Продление: `... --profile tls run --rm certbot renew`, затем `... exec nginx nginx -s reload`.
  Обе команды нужно поставить в расписание на сервере.
- Миграции БД выполняет одноразовый сервис `migrate` при старте.
- Метрики GPU — профиль `gpu` (`--profile gpu`).
- После изменения переменных `VITE_*` образ nginx пересобирается.

## 6.4. Локальный запуск без TLS (`backend/compose.yaml`)

Для локального стенда и разработки: без nginx и TLS, порты сервисов публикуются на адреса из
`backend/.env` (по умолчанию `127.0.0.1`). Авторизация на сервисах по умолчанию выключена
(`AUTH_ENABLED=false`).

```shell
cd backend
cp .env.example .env        # заменить пароли
docker compose --env-file .env config --quiet
docker compose --env-file .env up -d --build
```

Фронтенд в режиме разработки (Node.js 22 и npm):

```shell
cd frontend
cp .env.example .env
# в .env: VITE_CARD_API_PROXY_TARGET=http://127.0.0.1:8080,
#         VITE_AUTH_API_PROXY_TARGET=http://127.0.0.1:8084,
#         VITE_REALTIME_GATEWAY_PROXY_TARGET=http://127.0.0.1:8081,
#         VITE_ADMIN_API_PROXY_TARGET=http://127.0.0.1:8082
npm ci
npm run dev                  # http://127.0.0.1:5173
```

Микрофон браузер разрешает на `localhost` и `127.0.0.1`; с другого адреса нужен HTTPS.

## 6.5. Сборка фронтенда отдельно

```shell
cd frontend
npm ci
npm run lint
npm run build                # tsc -b + vite build → frontend/dist
```

Каталог `dist/` — статические файлы. Их раздаёт любой веб-сервер с fallback на `index.html`
и проксированием путей `/student-api`, `/auth-api`, `/realtime-gateway`, `/admin-api` к сервисам.
Готовая конфигурация — `frontend/Dockerfile` и `frontend/nginx/`. Модульные тесты чистой логики
запускаются встроенным раннером Node.js (22.6+ с поддержкой TypeScript):
`node --test $(find src -name "*.test.ts")`.

## 6.6. Демо-режим

```shell
cd frontend
VITE_DEMO=true npm run dev
```

Включает разом все моки кабинета преподавателя (монитор, назначения, обучаемые, справочник служб,
сценарии, разбор, генерация). Вход демо-режим не подменяет: нужен работающий auth-api.

## 6.7. Тестовые учётные записи

Создаются миграцией `0003_seed_training_users`.

| Логин | Пароль | Роль |
|---|---|---|
| `yWJJ9_z` | `Alekseev112-` | преподаватель |
| `yWJJ9_y` | `Ivanov112-11` | обучаемый |
| `yWJJ9_x` | `Andreeva112-` | обучаемый |

Учётной записи администратора в начальных данных нет — её создаёт эксплуатация.

## 6.8. Восстановление после сбоя

- Долгоживущие сервисы перезапускаются автоматически (`restart: unless-stopped`). Одноразовые
  сервисы безопасно запускать повторно: `migrate` применяет только недостающие миграции,
  `kafka-init` создаёт топики с `--if-not-exists`.
- Состояние хранится в именованных томах: PostgreSQL (primary и replica), Kafka, SeaweedFS,
  Prometheus, Loki, Grafana, сертификаты. Резервное копирование томов и дамп PostgreSQL
  настраиваются при развёртывании (см. раздел 5).
- Потерянные при сбое события браузер добирает запросом к REST после восстановления
  SSE-соединения.
