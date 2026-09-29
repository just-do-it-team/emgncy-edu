# 7. Перечень библиотек и лицензий

Перечень составлен 29.09.2026 по состоянию репозитория:

- фронтенд — по `frontend/package-lock.json` и `node_modules/*/package.json`;
- бэкенд — по `backend/pyproject.toml` и `backend/speech/pyproject.toml`, лицензии по метаданным
  пакетов на PyPI;
- модели — по карточкам на Hugging Face;
- системные компоненты — по образам Docker Compose.

Полный перечень, включая все 142 пакета сборки фронтенда, — в файле `THIRD_PARTY_LICENSES.md`
в корне репозитория.

Колонка «Коммерция» — допускает ли лицензия коммерческое использование: **да**, **нет** или
**с условиями**.

## 7.1. Итог

**Утверждение «используются только открытые компоненты, допускающие коммерческое
использование» верно не полностью.**

- Собственный код решения, все библиотеки фронтенда и бэкенда, все три модели ИИ, СУБД, брокер,
  хранилище и Prometheus распространяются под открытыми разрешительными лицензиями: MIT, ISC,
  BSD, Apache-2.0, PostgreSQL License, OFL-1.1. Коммерческое использование разрешено.
- Лицензий, запрещающих коммерческое использование (CC-BY-NC, «только для исследований» и
  подобных), нет.
- Исключения перечислены в п. 7.7: проприетарный стек NVIDIA CUDA, компоненты с copyleft-условиями
  (Grafana и Loki под AGPL-3.0, FFmpeg, SoX, libsndfile) и голосовые образцы для синтеза речи
  с незафиксированным происхождением.

## 7.2. Фронтенд — прямые зависимости сборки

| Пакет | Версия | Лицензия | Назначение | Коммерция |
|---|---|---|---|---|
| react, react-dom | 18.3.1 | MIT | UI-библиотека | да |
| react-router-dom | 6.26.0 | MIT | Маршрутизация | да |
| @mantine/core, hooks, form, dates, notifications, charts | 8.3.18 | MIT | UI-компоненты, формы, даты, уведомления, графики | да |
| @tanstack/react-query | 5.89.0 | MIT | Кэш серверных данных | да |
| zustand | 5.0.8 | MIT | Клиентское состояние | да |
| axios | 1.12.2 | MIT | HTTP-клиент | да |
| dayjs | 1.11.23 | MIT | Даты и время | да |
| lucide-react | 0.427.0 | ISC | Иконки | да |
| react-icons | 5.7.0 | MIT | Иконки; используется только набор Material Design (Apache-2.0) | да |
| recharts | 3.10.1 | MIT | Графики | да |
| pdfmake | 0.3.11 | MIT | PDF-отчёты | да |
| nspell | 2.1.5 | MIT | Проверка орфографии | да |
| dictionary-ru | 3.0.0 | BSD-3-Clause | Русский словарь Hunspell (автор — А. И. Лебедев) | да; изменённые версии словаря нужно помечать |
| @fontsource/roboto | 5.3.0 | OFL-1.1 | Шрифт Roboto в сборке | да |
| prettier | 3.3.3 | MIT | Форматирование кода; в сборку не попадает | да |

Все 142 пакета, попадающих в сборку вместе с транзитивными:

| Лицензия | Пакетов |
|---|---|
| MIT | 120 |
| ISC | 12 |
| BSD-3-Clause | 3 |
| OFL-1.1, Apache-2.0, BlueOak-1.0.0, 0BSD, MIT AND Zlib, MIT OR CC0-1.0, MIT AND ISC | по 1 |

Все лицензии разрешительные, коммерция — да. У `png-js@1.1.0` поле лицензии не заполнено,
по файлу LICENSE это MIT.

## 7.3. Фронтенд — инструменты разработки

В сборку не попадают.

| Пакет | Версия | Лицензия | Коммерция |
|---|---|---|---|
| vite | 5.4.0 | MIT | да |
| @vitejs/plugin-react | 4.3.1 | MIT | да |
| typescript | 5.5.4 | Apache-2.0 | да |
| eslint, @eslint/js | 9.9.0 | MIT | да |
| typescript-eslint | 8.1.0 | MIT | да |
| @tanstack/eslint-plugin-query | 5.89.0 | MIT | да |
| eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals | — | MIT | да |
| sass-embedded | 1.77.8 | MIT | да |
| postcss, autoprefixer | 8.4.41, 10.4.20 | MIT | да |
| @types/node, @types/react, @types/react-dom, @types/nspell | — | MIT | да |

## 7.4. Бэкенд — Python

Прямые зависимости. Файла фиксации версий (lock) для Python в репозитории нет, поэтому
транзитивные зависимости не перечислены. Версии в таблице — ограничения из `pyproject.toml`.

| Пакет | Версия | Лицензия | Коммерция | Где |
|---|---|---|---|---|
| fastapi | 0.141.1 | MIT | да | все сервисы |
| uvicorn[standard] | 0.53.0 | BSD-3-Clause | да | все сервисы |
| pydantic-settings | 2.15.0 | MIT | да | все сервисы |
| python-multipart | 0.0.20 | Apache-2.0 | да | все сервисы |
| sqlalchemy[asyncio] | 2.0.54 | MIT | да | card-api, воркеры |
| asyncpg | 0.31.0 | Apache-2.0 | да | card-api, воркеры |
| alembic | 1.20.0 | MIT | да | миграции |
| aiokafka | 0.14.0 | Apache-2.0 | да | воркеры, realtime-gateway |
| httpx | 0.28.1 | BSD-3-Clause | да | воркеры, admin-api |
| hatchling | ≥ 1.27 | MIT | да | сборка пакета |
| pytest, pytest-asyncio, aiosqlite | 8.4.2, 0.26.0, 0.22.1 | MIT, Apache-2.0, MIT | да | только тесты |
| torch (сборка cu130) | 2.10.* | BSD-3-Clause | да | speech-api |
| nvidia-* (CUDA runtime, cuBLAS, cuDNN, NCCL; зависимости torch) | по torch | NVIDIA Proprietary | с условиями | speech-api |
| triton | по torch | MIT | да | speech-api |
| torchaudio | 2.10.* | BSD-2-Clause | да | speech-api |
| torchcodec | 0.10 | BSD-3-Clause | да | speech-api |
| transformers | 5.* | Apache-2.0 | да | speech-api |
| gigaam | ветка `main` | MIT | да | speech-api |
| numpy | 2.x | BSD-3-Clause | да | speech-api |
| numba | ≥ 0.62 | BSD-2-Clause | да | speech-api |
| pyarrow | ≥ 23 | Apache-2.0 | да | speech-api |
| soundfile | 0.13+ | BSD-3-Clause; включает libsndfile под LGPL-2.1 | с условиями | speech-api |
| pyannote.audio | 4.0.* | MIT | да; объявлен, но в коде не используется | speech-api |

## 7.5. Модели ИИ и рантаймы

Веса моделей в репозиторий не входят и размещаются на сервере при установке (раздел 6).

| Компонент | Модель | Лицензия | Коммерция |
|---|---|---|---|
| Распознавание речи | GigaAM-v3, вариант e2e RNNT (`ai-sage/GigaAM-v3`) | MIT | да |
| Синтез речи | Qwen3-TTS-12Hz-0.6B-Base (`Qwen/Qwen3-TTS-12Hz-0.6B-Base`), GGUF Q8_0 + проектор F16 | Apache-2.0 | да |
| Языковая модель | gpt-oss-20b (`openai/gpt-oss-20b`) | Apache-2.0 и правила использования OpenAI | да |
| Рантайм синтеза и языковой модели | llama.cpp (`ggml-org/llama.cpp`) | MIT | да |

## 7.6. Системные компоненты

| Компонент | Образ | Лицензия | Коммерция |
|---|---|---|---|
| PostgreSQL 17 | `postgres:17.11-bookworm` | PostgreSQL License | да |
| Apache Kafka 3.4 | `bitnamilegacy/kafka:3.4` | Apache-2.0 | да; архивный образ без обновлений безопасности |
| SeaweedFS | `chrislusf/seaweedfs:4.47` | Apache-2.0 | да |
| nginx | `nginx:1.27-alpine` | BSD-2-Clause | да |
| Node.js (только сборка фронтенда) | `node:22-alpine` | MIT | да |
| Python | `python:3.12-slim` | PSF-2.0 | да |
| certbot | `certbot/certbot:latest` | Apache-2.0 | да |
| Prometheus | `prom/prometheus:v3.14.0` | Apache-2.0 | да |
| Grafana Alloy | `grafana/alloy:v1.19.2` | Apache-2.0 | да |
| Blackbox, Node, PostgreSQL, Kafka exporters; cAdvisor | см. `docker-compose.yaml` | Apache-2.0 | да |
| NVIDIA GPU exporter | `utkuozdemir/nvidia_gpu_exporter:1.13.1` | MIT | да |
| **Grafana** | `grafana/grafana:13.2.2` | **AGPL-3.0** | с условиями |
| **Grafana Loki** | `grafana/loki:3.7.0` | **AGPL-3.0** | с условиями |
| **NVIDIA CUDA + cuDNN** | `nvidia/cuda:13.0.2-cudnn-runtime/devel-ubuntu24.04` | **Проприетарная NVIDIA** | с условиями |
| **FFmpeg** (пакет Ubuntu в образе speech-api) | Ubuntu 24.04 | **GPL-2.0-or-later** | с условиями |
| **SoX, libsndfile** (пакеты Ubuntu в образе speech-api) | Ubuntu 24.04 | **GPL-2.0+ / LGPL-2.1** | с условиями |

## 7.7. Исключения и условия

| № | Компонент | Условие | Что это значит для решения |
|---|---|---|---|
| 1 | Grafana, Grafana Loki | AGPL-3.0 | Используются без изменений, как отдельные сервисы наблюдаемости. При изменении их исходного кода и предоставлении по сети изменения нужно раскрыть. Можно заменить: Prometheus и admin-api работают без Grafana |
| 2 | NVIDIA CUDA, cuDNN, CUDA-библиотеки PyTorch | Проприетарные лицензии NVIDIA, не open source | Бесплатны, коммерческое использование разрешено на условиях NVIDIA; распространение ограничено. Без них распознавание и синтез речи на GPU не работают |
| 3 | FFmpeg, SoX, libsndfile | GPL / LGPL | Используются как отдельные системные библиотеки и программы. При распространении образа speech-api нужно предоставить их исходный код или ссылку на него |
| 4 | Голосовые образцы для синтеза речи: `backend/models/refs/*.mp3` (7 файлов), `backend/reference.mp3`, `backend/reference.wav` | Лицензия и происхождение записей не зафиксированы | Для промышленного использования нужны права на записи и согласие дикторов: голос — биометрические персональные данные (152-ФЗ). Образцы можно заменить своими записями без изменения кода |
| 5 | dictionary-ru | BSD-3-Clause с условием автора словаря | Изменённые версии словаря нужно явно помечать. Словарь используется без изменений |
| 6 | gpt-oss-20b | Apache-2.0 и правила использования OpenAI | Коммерческое использование разрешено при соблюдении правил допустимого использования |

## 7.8. Данные заказчика

- Классификатор происшествий (`incident-classifier.json`, 1283 записи) собран из материалов
  заказчика — классификатора происшествий и маршрутизации служб.
- Текст памятки «Работа на АРМ-112» в разделе «Справка» взят из материалов заказчика.

Это данные предметной области, предоставленные для задачи, а не сторонние программные компоненты.

## 7.9. Что не удалось установить

- Точный источник GGUF-файлов Qwen3-TTS. Лицензия наследуется от исходной модели (Apache-2.0),
  но источник скачивания в репозитории не записан. Файл проектора, по-видимому, получен
  конвертацией исходной модели.
- Конкретный GGUF-файл gpt-oss-20b и версия llama-server: они находятся вне репозитория.
- Фактические версии Python-пакетов и их транзитивных зависимостей: lock-файла нет.
