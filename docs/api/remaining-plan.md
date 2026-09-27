# Оставшиеся задачи кабинета преподавателя: разведка и план

Статус: черновик
Потребитель на фронте: кабинет преподавателя, кабинет администратора
Связанные документы: `docs/api/open-questions.md`, `docs/api/attempts.md`,
`docs/api/attempt-replay.md`, `docs/api/scenario-builder.md`, `docs/api/realtime.md`

Проверено по коду 07026c4 и текущей ветке `feat/scenario-builder` 28.09.2026. Пути бэка даны
относительно `backend/src/s112`, фронта — относительно `frontend/src`.

## Сводка

| Направление | На бэке | Фронт сейчас | Объём фронта | Блокирует бэк |
|---|---|---|---|---|
| A. Монитор занятия | частично: снимок сессий, действия, прерывание общего рабочего места | заглушка маршрута `monitor/:lessonId` | M (L с потерей связи и прерыванием индивидуальной попытки) | прерывание индивидуальной попытки преподавателем, `last_presence_at`, SSE по `teacher_id` |
| B. ИИ в кабинете | нет ручек генерации и разбора; LLM-клиент есть | алгоритмическая сводка занятия | S (разбор занятия) + M (генерация сценария на моке) | обе ручки генерации |
| C. Экспертная оценка | частично: одна оценка на сессию (балл, зачёт, комментарий) | мутация готова, экрана нет | S (форма оценки) | решения по расхождениям, добавленные ошибки, причина изменения балла |
| D. Администрирование | пользователи в admin-api, группы в card-api | заглушка `/admin` | M + M | admin-api не стартует, нет пользователя-администратора, нет проверки роли |

## A. Монитор занятия

### Что есть

- Маршрут `monitor/:lessonId` отдаёт `SectionPlaceholder` (`app/providers/router/ui/app-router.tsx:89-92`).
  Вход — ссылка «Открыть монитор занятия» в обзоре (`pages/teacher-overview/ui/teacher-overview-page.tsx:266-275`);
  `lessonId` — `batchId`, для одиночного назначения — `assignmentId`.
- Кнопки «Прервать» в кабинете нет.
- `entities/monitoring`: `GET /api/v1/teacher-monitoring/sessions?teacher_id&status` без опроса;
  `toMonitoredSession` отбрасывает поля, нужные монитору (`workspace_id`, счётчики карточек и звонков,
  `pending_card_keys`, `emitted_card_keys`, `successful_actions`, `rejected_actions`, `last_activity_at`,
  `participants[].position_code`, `participants[].status`).

### Бэкенд

| Ручка | Что даёт |
|---|---|
| `GET /api/v1/teacher-monitoring/sessions?teacher_id=&status=` | снимок сессий преподавателя; `status=""` — все. Фильтра по пакету и назначению нет. README рекомендует опрос раз в 5–10 с (`api/teacher/active_sessions/README.MD`) |
| `GET /api/v1/teacher-monitoring/sessions/{id}?teacher_id=` | одна сессия; чужая — 404 |
| `GET /api/v1/training-sessions/{id}/actions` (`X-User-Id` преподавателя) | хронология действий, включая `CARD_OPEN_DEADLINE_MISSED`, `CARD_DECISION_DEADLINE_MISSED`, `SESSION_ABORTED` |
| `GET /api/v1/workspaces/{id}/cards` | у служб карточки `acceptance_deadline_at`, `decision_deadline_at`, `open_deadline_missed_at`, `decision_deadline_missed_at` |
| `POST /api/v1/training-sessions/{id}/abort` `{teacher_id, reason}` | **только общее рабочее место** (`api/simulation_service.py:1979`); индивидуальную попытку прерывает только сам обучаемый `{user_id}` |

Присутствие: АРМ шлёт `POST /training-sessions/{id}/presence` раз в 5 с, сервер пишет
`WorkspaceMember.last_presence_at` и через 30 с без сигнала сам прерывает попытку с причиной
`PRESENCE_TIMEOUT`. `last_presence_at` не отдаёт ни одна ручка.

SSE: фильтр `teacher_id` есть (`realtime_gateway/hub.py:47-70`), но при включённой авторизации
обязателен `workspace_id` (`realtime_gateway/main.py:82-93`) — одно соединение на попытку, что
запрещено правилом «одно соединение на занятие». Разбор потока живёт в
`pages/workspace-page/ui/read-sse-stream.ts`, наружу не экспортируется.

### Данные MVP

| Что | На бэке | Откуда |
|---|---|---|
| Тревога «не открыта за 30 с» | есть | действие `CARD_OPEN_DEADLINE_MISSED` |
| Тревога «нет первой записи за 3 мин» | частично | действие `CARD_DECISION_DEADLINE_MISSED`; сервер меряет 180 с от открытия до решения, а не до записи со статусом и текстом — `open-questions.md`, раздел 12 |
| Бездействие | частично | порог на клиенте по `last_activity_at` (последнее действие) |
| Прерывание | есть | `status=ABORTED`, причина в `/actions` |
| Потеря связи | нет | видна только постфактум как прерывание `PRESENCE_TIMEOUT` |
| ФИО, статус | есть | `participants[].display_name`, `status` |
| Рабочее место | частично | `position_code`, `participant_role` |
| Текущий элемент | частично | `pending_card_keys`, `emitted_card_keys`, счётчики звонков |
| Таймер против норматива | частично | дедлайны служб карточки; тикает на клиенте |
| Расхождения | нет вживую | считаются при завершении; вживую — `rejected_actions` и просрочки |
| Переход в разбор | есть | `/teacher/attempts/:sessionId/review` |
| «Прервать» | частично | общее рабочее место — да; индивидуальное — кнопка заблокирована с пояснением |

### Решение

Опрос, не поток. `GET /teacher-monitoring/sessions?status=` раз в 5 с, фильтр по занятию на
клиенте; для попыток `RUNNING` — `/actions` раз в 10 с для ленты тревог. Поток — после того как
бэк разрешит подписку по `teacher_id` без `workspace_id`.

Состав: расширить маппер снимка отдельной функцией `toLiveSession`; `pages/teacher-lesson-monitor`
(таблица обучаемых, лента тревог, таймеры); `features/abort-session` с обязательной причиной.

### Требуется на бэкенде

| Приоритет | Что | Блокирует |
|---|---|---|
| P0 | прерывание индивидуальной попытки преподавателем: `POST /training-sessions/{id}/abort {teacher_id, reason}` без ограничения `SHARED`, причина в `result.abort_reason` | «Прервать» в мониторе для индивидуальных занятий |
| P1 | `last_presence_at` участника в снимке `teacher-monitoring/sessions` | тревога «потеря связи» до автопрерывания |
| P1 | фильтр `assignment_batch_id` и `assignment_id` в `teacher-monitoring/sessions` | лишний трафик при опросе |
| P1 | подписка SSE по `teacher_id` без `workspace_id` с проверкой преподавателя | одно соединение на занятие |
| P2 | `current_item_key` и время подачи элемента в снимке | точный «текущий элемент» и таймер без второго запроса |

## B. ИИ в кабинете

### Что есть

- LLM `gpt-oss-20b` на OpenAI-совместимом сервере `host.docker.internal:4555`. Используется в двух местах:
  диалог заявителя и руководителя бригады (`dialogue/worker.py`, потоково через Kafka) и смысловая
  проверка исходящего звонка ДДС (`semantic_evaluation/client.py`, `temperature: 0`,
  `response_format: json_object`, разбор JSON). Второй клиент пригоден для обобщения.
- Ручек генерации сценария, эталона, шаблона и разбора занятия нет
  (`docs/api/scenario-builder.md:284-295`, открытый вопрос 6).
- Фронт: ни одного обращения к ИИ. Сводка занятия алгоритмическая —
  `features/teacher-lessons/model/lesson-summary.ts` (критерии по числу затронутых попыток, повторяющиеся
  расхождения, просрочки раскрытия и решения, распределение баллов, прерванные попытки, участники без попыток).
- Модель не решает, верен ли ответ (`docs/domain/ekp.md`): классификация и службы берутся из
  классификатора, модель сочиняет только свободный текст.

### UI

- «Сгенерировать с ИИ» на странице нового сценария: модалка параметров (группа происшествий,
  сложность 1–4, роль «Оператор 112» / «Диспетчер ДДС», число элементов 1–10) → черновик открывается в
  обычном редакторе с полосой «Сгенерировано ИИ — проверьте эталон» до первого сохранения. Черновик
  не сохраняется сервером, пока преподаватель не нажмёт «Сохранить».
- «Разбор ИИ» на странице занятия: кнопка «Сформировать»; при ошибке или недоступности модели — текущая
  алгоритмическая сводка с пометкой «модель недоступна, показан расчёт по расхождениям». Текст модели
  подписан «не подтверждено» (`docs/domain/attempt-scoring.md`).

### Контракт

#### POST /api/v1/scenario-drafts/generate

Назначение: черновик сценария со встроенными элементами; ничего не сохраняет.
Отношение к существующему: новая. Доступ: teacher, admin; student — нет.

```json
{
  "teacher_id": "8c1d6a52-0f3e-4b8e-9d51-2f6b3c1a0201",
  "classification_group": "Пожар",
  "difficulty": 2,
  "role": "DDS",
  "position_code": "101",
  "item_count": 3,
  "request_id": "gen-5b2f0c7e"
}
```

| Поле | Тип | Обязательно | Ограничения |
|---|---|---|---|
| `teacher_id` | uuid | да | TEACHER или ADMINISTRATOR |
| `classification_group` | string | да | группа верхнего уровня классификатора |
| `difficulty` | int | да | 1–4 |
| `role` | `"OPERATOR_112" \| "DDS"` | да | |
| `position_code` | string \| null | для `DDS` | код службы; для оператора 112 — `null` |
| `item_count` | int | да | 1–10 |
| `request_id` | string | нет | ≤128, идемпотентность повтора |

Ответ `200` — тело `TrainingScenarioCreate` без `created_by` и `status`, плюс сведения о генерации:

```json
{
  "scenario": {
    "name": "Пожар в жилом доме — ДДС 101",
    "description": "Три карточки о возгорании в жилом секторе САО",
    "difficulty": 2,
    "estimated_duration_seconds": 600,
    "passing_score": 100,
    "workspace_mode": "INDIVIDUAL",
    "completion_policy": "STUDENT_CONFIRM",
    "min_participants": 1,
    "max_participants": 1,
    "required_participant_positions": ["101"],
    "definition": {
      "schema_version": 1,
      "mode": "STATIC",
      "cards": [
        {
          "key": "card-1",
          "item_type": "INCIDENT_CARD",
          "source_type": "INLINE",
          "trigger_type": "TIME_OFFSET",
          "trigger_config": { "offset_seconds": 0 },
          "initial_card": {
            "description": "Из окна квартиры на 5 этаже идёт дым, видно открытое пламя",
            "applicant_full_name": "Смирнова Ольга Петровна",
            "automatic_phone_number": "+79161234567",
            "incident_address": "г. Москва, ул. Дубининская, д. 57, корп. 2"
          },
          "expected_result": {
            "card": {
              "classification": { "record_id": 1050101, "group_code": 1, "feature_1_code": 5, "feature_2_code": 1, "feature_3_code": 1, "final_incident_type": "пожар: квартира" },
              "services": ["101", "103"]
            },
            "service_status_history": {
              "101": [
                { "status": "RECEIVED", "comment": null, "unit_number": null },
                { "status": "ACCEPTED", "comment": "Выслан расчёт ПСЧ-12", "unit_number": null }
              ]
            },
            "outbound_call": null
          }
        }
      ]
    }
  },
  "generation": {
    "model": "gpt-oss-20b",
    "generated_at": "2026-09-28T10:15:03+03:00",
    "generated_fields": ["name", "description", "initial_card.*", "service_status_history.*.comment"]
  }
}
```

Классификация и службы подставляются сервером из `incident_classifier_reference.json`, тело
проходит `_validate_template_content`. Фронт переводит элементы в черновик готовыми
`cardSourceFromJson` и `expectedFromJson`.

Ошибки: `404` — группа не найдена; `422` — валидация; `502` — модель недоступна или ответ не прошёл
валидацию (`{"detail": "Модель недоступна"}`); `409` — повтор `request_id` с другим телом.

#### POST /api/v1/lesson-reviews/generate

Назначение: текстовый разбор занятия по завершённым попыткам. Новая. Доступ: teacher (свои
назначения), admin.

```json
{
  "teacher_id": "8c1d6a52-0f3e-4b8e-9d51-2f6b3c1a0201",
  "assignment_batch_id": "3f0a9e1c-7d24-4c1b-8a55-91e2d7c4b6a0",
  "session_ids": ["b1e25a47-6c0d-4f3a-9e81-5d2c7a904f13", "c7d96e02-3b18-4a5f-8c27-0e4f1b6d2a95"]
}
```

Ответ `200`:

```json
{
  "summary": "Большинство обучаемых приняли карточку вовремя, но у 4 из 9 нет первой записи в течение 3 мин.",
  "strengths": ["Решение принять или отклонить совпало с компетенцией службы у 8 из 9"],
  "weaknesses": ["Комментарии к статусам формальные: «принято», «выехали»"],
  "recommendations": ["Повторить сценарий с отказом по компетенции и мотивировкой"],
  "basis": { "sessions": 9, "discrepancies": 41 },
  "model": "gpt-oss-20b",
  "generated_at": "2026-09-28T18:40:11+03:00"
}
```

Ошибки: `404` — нет пакета; `409` — нет завершённых попыток; `502` — модель недоступна.
Кэш: класс «аналитика и отчёты», обновление кнопкой.

### Требуется на бэкенде

| Приоритет | Что | Блокирует |
|---|---|---|
| P1 | `POST /scenario-drafts/generate` на обобщённом `SemanticEvaluationClient` | генерация сценария без мока |
| P1 | `POST /lesson-reviews/generate` | «Разбор ИИ» без запасного алгоритма |
| P2 | признак неподтверждённого эталона у сценария (`expected_confirmed_at`) | пометка «сгенерировано» переживает сохранение |

## C. Экспертная оценка

### Что есть

`PUT /api/v1/training-sessions/{id}/expert-assessment` (`api/teacher/performance/api.py:104-122`):
`{teacher_id, score 0..100 (2 знака), passed, comment ≤ 10000}`. Одна оценка на сессию, PUT целиком
заменяет прежнюю, `expected_version` нет. Только `COMPLETED` (прерванная — 409). Итог
`final_score` — экспертный, если есть. Событие `training.expert_assessment_updated`.

| Возможность | На бэке |
|---|---|
| подтвердить или отклонить расхождение | нет: у расхождений нет идентификатора и хранилища решений |
| добавить пропущенную ошибку | нет, только текстом в `comment` |
| изменить балл с причиной | частично: `score` + `passed`, причина — в `comment` |

Фронт: `useUpdateExpertAssessment` экспортирован и нигде не вызван; страница разбора показывает
только балл преподавателя.

### Что делаем сейчас

Форма «Оценка преподавателя» на странице разбора: балл, зачёт (по умолчанию — балл не ниже порога),
комментарий, «кто и когда оценил»; заблокирована с пояснением для прерванной попытки; 409 и 422 —
явным сообщением. Решения по расхождениям не имитируем текстом комментария: без хранилища их не
восстановить.

`docs/api/attempt-replay.md:136-139` устарел: контекст прерванной попытки отдаётся.

### Требуется на бэкенде

| Приоритет | Что | Блокирует |
|---|---|---|
| P1 | `expected_version` или `If-Match` у оценки | перезапись оценки другим преподавателем |
| P1 | `expert_decisions[] {element_key, path, decision: CONFIRMED \| REJECTED, note}` | подтверждение расхождений |
| P1 | `expert_findings[] {element_key, criterion_code, path, description, severity}` | добавление пропущенных ошибок |
| P2 | `override_reason` отдельно от `comment`, история оценок | обоснование изменения балла |
| P2 | оценка прерванной попытки | разбор `ABORTED` с оценкой |

## D. Администрирование

### Что есть

- admin-api не стартует: `admin_api/main.py:12` импортирует отсутствующий `admin_api/logs`.
- Пользователи: `GET /api/v1/admin/users?search&role&is_blocked&limit&offset` (`{items, total, limit, offset}`),
  `POST /users` `{username, display_name, email?, password, role}` (пароль по политике безопасности, 409 при
  дубле), `PATCH /users/{id}/role`, `PATCH /users/{id}/block {blocked, reason?}`. Сброса пароля,
  правки ФИО и удаления нет. Роль администратора не проверяется.
- Группы — в card-api: `POST /api/v1/learning-groups`, `GET /learning-groups?teacher_id=` (только по одному
  преподавателю), `PATCH /learning-groups/{id}`, `POST /learning-groups/{id}/members`,
  `DELETE /learning-groups/{id}/members/{student_id}?actor_id=`. Администратор проходит проверку владельца.
- Сид-пользователя с ролью `ADMINISTRATOR` нет.
- Фронт: `/admin` — заглушка, клиента к admin-api и прокси нет. Групп и обучаемых на фронте — только чтение.

Кабинет администратора — зона Игоря; в его коммитах работы по админке пока нет.

### Требуется на бэкенде

| Приоритет | Что | Блокирует |
|---|---|---|
| P0 | запуск admin-api без модуля `logs` | вкладка «Пользователи» |
| P0 | пользователь `ADMINISTRATOR` в сидах | вход в кабинет администратора |
| P0 | проверка роли администратора в admin-api | RBAC |
| P1 | `GET /learning-groups` без `teacher_id` для администратора | список всех групп без N+1 |
| P2 | сброс пароля и правка ФИО | сопровождение учётных записей |

## Порядок на сутки

| # | Задача | Объём | Почему в этом месте |
|---|---|---|---|
| 1 | C. Форма экспертной оценки на существующем PUT | S, 2–3 ч | ручка работает, мутация готова, закрывает «оценки с обязательным комментарием» из ролей |
| 2 | A. Монитор занятия на опросе: строки обучаемых, лента тревог по действиям, бездействие, переход в разбор, «Прервать» для общего рабочего места и заблокированная кнопка с пояснением для индивидуального | M, 6–7 ч | главный пробел кабинета, данных хватает на большую часть |
| 3 | B. «Разбор ИИ» на странице занятия с запасной алгоритмической сводкой | S, 2 ч | запасной путь уже посчитан; ручка на моке, контракт выше |
| 4 | B. «Сгенерировать с ИИ» в конструкторе на моке | M, 4–5 ч | черновик переводится готовыми функциями; без бэка генерация фиктивная |
| — | D. Вкладки «Пользователи» и «Группы» | M + M | зона Игоря и блокеры P0 на бэке; передать ему этот раздел |

Бэкенду в первую очередь: прерывание индивидуальной попытки преподавателем, запуск admin-api,
обе ручки генерации, `last_presence_at` в снимке.
