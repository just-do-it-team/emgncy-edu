# emgncy-edu

Тренажёр подготовки операторов Системы-112 Москвы. Воспроизводит рабочие места ПОВ-112
(АРМ-112 и АРМ ДДС) и кабинеты для организации обучения. Работает в изолированном контуре,
без внешних запросов.
=======
## Развёртывание через корневой Compose

`docker-compose.yaml` поднимает бэкенд и nginx с фронтендом. Фронтенд собирается
в отдельном этапе Dockerfile: в конечный образ попадают только nginx и файлы `dist`.
Порты бэкенда и инфраструктуры не публикуются на хосте; nginx занимает 80 и 443.
Имя Compose-проекта задано как `backend`, поэтому при стандартном запуске
`backend/compose.yaml` и корневой файл используют одни и те же volumes данных.
Не запускайте два варианта стека одновременно.

1. Заполните `backend/.env` по образцу `backend/.env.example`: задайте уникальные
   пароли и секрет JWT. Заполните `frontend/.env` по образцу `frontend/.env.example`:
   для production оставьте `VITE_USE_MOCKS=false`, `VITE_DEMO=false` и адреса API
   `/student-api`, `/auth-api`, `/admin-api`, `/realtime-gateway`. Переменные
   `VITE_*_PROXY_TARGET` используются только dev-сервером и в production-сборку
   не передаются. Скопируйте корневой `.env.example` в `.env` и задайте домен
   и почту Certbot. Домен должен указывать на сервер, а порты 80 и 443 должны быть
   доступны. Для другого каталога моделей задайте `ROOT_SPEECH_MODELS_DIR` в корневом
   `.env` (путь отсчитывается от корня проекта).
2. Запустите стек:
   `docker compose --env-file frontend/.env --env-file backend/.env --env-file .env up -d`.
   До выпуска сертификата nginx обслуживает только HTTP-проверку домена и отвечает
   503 на остальные запросы. Значения `VITE_*` встраиваются при сборке фронтенда:
   после их изменения пересоберите nginx.
3. Один раз выпустите сертификат:
   `docker compose --env-file frontend/.env --env-file backend/.env --env-file .env --profile tls run --rm certbot`.
   Затем выполните
   `docker compose --env-file frontend/.env --env-file backend/.env --env-file .env restart nginx`, чтобы включить HTTPS.

Сертификаты хранятся в volume `letsencrypt`, поэтому пересборка фронтенда их не
затрагивает. Сертификат нужно регулярно продлевать командой
`docker compose --env-file frontend/.env --env-file backend/.env --env-file .env --profile tls run --rm certbot renew`;
после успешного продления выполните
`docker compose --env-file frontend/.env --env-file backend/.env --env-file .env exec nginx nginx -s reload`. Эти две команды следует
запланировать на сервере.

nginx направляет `/student-api`, `/auth-api`, `/realtime-gateway`, `/admin-api` и
`/speech-api` к соответствующим сервисам во внутренней сети. Публичный доступ к
speech API требует токен авторизации; остальные защищённые методы проверяют JWT в
самих сервисах. Для корневого стека авторизация включена по умолчанию.

## Роли

| Роль | Что делает |
|---|---|
| Обучаемый | проходит назначенные занятия. Роль в тренажёре задаёт задание: **оператор 112** принимает вызов и заполняет карточку, **диспетчер ДДС** принимает или отклоняет карточку и ведёт статусы реагирования |
| Преподаватель | готовит шаблоны и сценарии (вручную или с помощью ИИ), назначает занятия группам, следит за ними в мониторе, разбирает попытки и выставляет оценку |
| Администратор | учётные записи, состояние сервисов, журналы и отчёты |

## Локальный запуск

Нужны Node.js и npm. Из каталога `frontend/`:

```sh
cp .env.example .env
npm install
npm run dev
```

Дев-сервер — `http://127.0.0.1:5173`. В `frontend/.env` укажите адреса стенда:
`VITE_CARD_API_PROXY_TARGET` (card-api, порт 8080) и `VITE_AUTH_API_PROXY_TARGET` (auth-api,
порт 8084); адреса выдаёт бэкенд-разработчик. Пока они пусты, dev-прокси не поднимается и
запросы к API получают `404` от самого дев-сервера. После правки `.env` дев-сервер нужно
перезапустить.

### Демо-режим

```sh
VITE_DEMO=true npm run dev
```

Включает разом все моки, нужные для показа кабинета преподавателя без живого стенда: монитор
занятия, назначения, обучаемых, справочник служб, сценарии, разбор попыток и генерацию ИИ.
Вход демо-режим не подменяет — нужен работающий auth-api.

## Развёртывание через Docker Compose

`docker-compose.yaml` в корне поднимает бэкенд и nginx с собранным фронтендом; наружу открыты
только порты 80 и 443. Нужны домен, указывающий на сервер, и видеокарта NVIDIA для сервиса речи.

1. Заполните `backend/.env` по `backend/.env.example` (пароли, секрет JWT), `frontend/.env` по
   `frontend/.env.example` (`VITE_USE_MOCKS=false`, `VITE_DEMO=false`, адреса API `/student-api`,
   `/auth-api`, `/realtime-gateway`), корневой `.env` по `.env.example` (домен и почта Certbot).
2. Запустите стек:
   `docker compose --env-file frontend/.env --env-file backend/.env --env-file .env up -d`.
   До выпуска сертификата nginx отвечает `503` на всё, кроме проверки домена. Значения `VITE_*`
   встраиваются при сборке: после их изменения пересоберите nginx.
3. Один раз выпустите сертификат и включите HTTPS:
   `docker compose --env-file frontend/.env --env-file backend/.env --env-file .env --profile tls run --rm certbot`,
   затем `docker compose --env-file frontend/.env --env-file backend/.env --env-file .env restart nginx`.

Сертификат продлевается командой `... --profile tls run --rm certbot renew` с последующим
`... exec nginx nginx -s reload` (те же `--env-file`); обе команды стоит запланировать на
сервере. nginx направляет `/student-api`, `/auth-api`, `/realtime-gateway`, `/admin-api` и
`/speech-api` к сервисам во внутренней сети; авторизация в этом стеке включена по умолчанию.

## Тестовые учётные записи


| Логин | Пароль | Роль |
|---|---|---|
| `yWJJ9_z` | `Alekseev112-` | преподаватель |
| `yWJJ9_y` | `Ivanov112-11` | обучаемый |
| `yWJJ9_x` | `Andreeva112-` | обучаемый |
| `admin112` | `AdminHERE112*+` | администратор |

## Документация

Основная документация приложена в папке при сдаче решения https://disk.yandex.ru/d/Oy_YJO6PVrdeFQ

| Где | Что |
|---|---|
| `frontend/README.md` | фронтенд: запуск, демо-режим, архитектура |
| `backend/README.md` | бэкенд: сервисы, запуск, конфигурация |
