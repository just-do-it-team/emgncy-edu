# Сценарии тренажёра

Статус: реализовано на бэкенде (чтение, создание, правка черновика, утверждение, архив); дельты — ниже
Потребитель на фронте: `entities/scenario`; экраны «Сценарии» (`pages/teacher-scenarios`), «Карточка
сценария» (`pages/teacher-scenario-card`), блок «Сценарий» на странице занятия
(`pages/teacher-lesson-results`)
Связанные файлы фронта: `frontend/src/entities/scenario/*`,
`frontend/src/shared/api/contracts/training-scenarios.ts`, `frontend/src/pages/teacher-scenarios/*`,
`frontend/src/pages/teacher-scenario-card/*`

Документ описывает ручки так, как они написаны в коде бэкенда
(`backend/src/s112/api/teacher/training_content/api.py`, `api/simulation_schemas.py`,
`api/simulation_service.py`). Устройство эталона, правила валидации, шаблоны и план конструктора —
в `docs/api/scenario-builder.md`.

## Назначение

Сценарий — набор элементов: входящих звонков (работа оператора 112) и карточек происшествия
(работа диспетчера ДДС), плюс, при необходимости, процедурная подача карточек из пула шаблонов.
У каждого элемента есть эталон `expected_result`: с ним сервер сравнивает итоговую карточку
обучаемого. Назначить обучаемым можно только утверждённый сценарий; назначение хранит снимок.

Чего в сценарии **нет**, вопреки прежней версии этого документа:
- поля роли (`mode` = `ARM112` / `DDS`). `definition.mode` — это `STATIC` / `PROCEDURAL` / `HYBRID`.
  Роль фронт выводит по составу: звонки → 112, карточки и процедурная подача → ДДС, оба вида →
  смешанный;
- веса в оценке (`weight`);
- признаков с `feature_id` и названиями, итогового типа и типа ЕКП-35 на уровне сценария.
  Классификация хранится у каждого элемента в эталоне (`classification.record_id` и коды признаков),
  названия фронт берёт из своего справочника классификатора;
- счётчика использований (`used_in_lessons`);
- настраиваемых нормативов: 30 с на раскрытие и 180 с на решение ДДС — константы бэкенда.

## Ручки

### GET /api/v1/training-scenarios

Назначение: список сценариев.
Отношение к существующему: существующая.
Доступ: `TEACHER`, `ADMINISTRATOR`; `STUDENT` — 403. Возвращаются сценарии **всех** преподавателей.

Заголовки: `X-User-Id`.

Query:
| Имя | Тип | Обязателен | По умолчанию | Описание |
|---|---|---|---|---|
| `status` | `DRAFT` \| `PUBLISHED` \| `ARCHIVED` | нет | — | точный статус |
| `difficulty` | int 1–5 | нет | — | точная сложность |
| `include_archived` | bool | нет | `false` | без `status` архивные скрыты; фронт передаёт `true` и фильтрует сам |

Успешный ответ: 200, голый массив `TrainingScenarioResponse`, сортировка по имени:

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | |
| `name` | str 1–255 | |
| `description` | str \| null | |
| `difficulty` | int 1–5 | фронт показывает 4 уровня: 1 Простой, 2 Средний, 3 Сложный, 4 Сверхсложный; 5 со старых данных — «Сверхсложный» |
| `estimated_duration_seconds` | int > 0 | ориентировочная длительность |
| `cards_count` | int | статических элементов + `target_count` процедурной подачи |
| `workspace_mode` | `INDIVIDUAL` \| `SHARED` | рабочее место |
| `completion_policy` | `STUDENT_CONFIRM` \| `AUTO_WHEN_READY` \| `TEACHER_ONLY` | кто завершает попытку |
| `min_participants`, `max_participants` | int | для `INDIVIDUAL` — 1 и 1 |
| `definition` | object | `schema_version`, `mode`, `cards[]`, `procedural_generation?`; поля со значением `null` сервер не хранит |
| `revision` | int ≥ 1 | растёт при каждой правке и при архивировании |
| `status` | `DRAFT` \| `PUBLISHED` \| `ARCHIVED` | в интерфейсе: Черновик, Утверждён, Архив |
| `created_by`, `updated_by` | uuid | автор и последний редактор |
| `created_at`, `updated_at` | datetime | |

Элемент `definition.cards[]`: `key`, `item_type` (`INCIDENT_CARD` / `INCOMING_CALL`),
`trigger_type` (`TIME_OFFSET` / `AFTER_ACTION`), `trigger_config`
(`{offset_seconds}` или `{card_key, action_type, delay_seconds}`), `source_type`
(`TEMPLATE` / `INLINE`), `template_id` у шаблона, `initial_card` и `expected_result` у встроенной
карточки.

### GET /api/v1/training-scenarios/{scenario_id}

Назначение: карточка сценария.
Отношение к существующему: существующая.
Доступ: как у списка.

Успешный ответ: 200, поля списка плюс `items[]`, разрешённые сервером по `definition.cards` в том
же порядке:

| Поле | Тип | Описание |
|---|---|---|
| `key`, `item_type`, `source_type`, `template_id` | | как в `definition.cards` |
| `template_name` | str \| null | название шаблона |
| `initial_card` | object \| null | исходная карточка (шаблон карточки или встроенная); у звонка — `null` |
| `expected_card` | object \| null | `expected_result.card` из шаблона или элемента. У шаблона ключи с `null` сохранены (поле «должно быть пустым»), у встроенной карточки их нет (поле «не проверяется») |
| `classification` | object \| null | классификация эталона или исходной карточки |
| `main_service` | object \| null | первая служба эталона |
| `notification_list` | array | `[{service_id, code, name, is_main}]` по `expected_card.services`, главная — первая |

`initial_call` в ответе больше нет: первую реплику звонка отдаёт
`GET /api/v1/incoming-call-templates/{id}`. Статусы реагирования и исходящий звонок эталона
(`service_status_history`, `outbound_call`) в `items[]` не входят: у встроенной карточки они в
`definition.cards[].expected_result`, у шаблона — в ответе ручки шаблона.

Ошибки:
| Код | Когда | Тело |
|---|---|---|
| 404 | сценария нет | `{"detail": "Training scenario not found"}` |
| 422 | `scenario_id` не uuid | валидация |

### POST /api/v1/training-scenarios

Назначение: создать сценарий. Фронт использует для «Создать копию»: GET исходного → POST с
именем «<название> (копия)» и статусом `DRAFT`.
Доступ: `TEACHER`, `ADMINISTRATOR`, автор — `created_by` в теле.

Тело: `name`, `description`, `difficulty`, `estimated_duration_seconds`, `workspace_mode`,
`completion_policy`, `min_participants`, `max_participants`, `definition`, `status` (по умолчанию
`DRAFT`), `created_by`.

Успешный ответ: 201, `TrainingScenarioResponse` с `revision = 1`.
Ошибки: 422 — структура `definition`, шаблон неактивен или не найден, классификация не совпадает с
записью классификатора, служба неизвестна или неактивна, пул процедурной подачи меньше
`target_count`.

### PATCH /api/v1/training-scenarios/{scenario_id}

Назначение: правка черновика и утверждение. Утверждение — `{"status": "PUBLISHED"}`.
Доступ: `TEACHER`, `ADMINISTRATOR`; **владелец не проверяется**.

Тело: `expected_revision` (обязательно), `updated_by`, любые поля сценария, `definition` целиком.

Успешный ответ: 200, `revision + 1`.
Ошибки:
| Код | Когда | Тело |
|---|---|---|
| 409 | `expected_revision` устарела | `{"detail": "Scenario revision conflict: expected N, actual M"}` |
| 409 | сценарий не черновик | `{"detail": "Only a draft scenario can be edited"}` |
| 422 | `status = ARCHIVED` или ошибки состава, как у POST | валидация |

Утверждённый сценарий не правится и не возвращается в черновик. Проверка состава при утверждении
без `definition` в теле не повторяется: она была при создании или последней правке.

### DELETE /api/v1/training-scenarios/{scenario_id}

Назначение: перенести в архив. Записи не удаляются, статус становится `ARCHIVED`.
Доступ: `TEACHER`, `ADMINISTRATOR`; владелец не проверяется.
Тело: `{deleted_by, expected_revision}`.
Успешный ответ: 204. Ошибки: 409 — ревизия устарела.
Назначенные занятия продолжаются по снимку.

## Связанные SSE-события

Нет. Экраны обновляются инвалидацией после мутации.

## Кэшируемость

| Данные | Класс | `staleTime` | Инвалидация |
|---|---|---|---|
| Список сценариев | полусправочники | 5 мин | после утверждения, архивирования, копии: `scenarioKeys.lists()` |
| Карточка сценария | полусправочники | 5 мин | после действия над ним: `scenarioKeys.detail(id)` |
| Шаблон элемента | полусправочники | 5 мин | `scenarioKeys.template(kind, id)`; шаблоны не редактируются |

Ключи — фабрика `scenarioKeys` (`entities/scenario/api/scenario.keys.ts`). При 409 фронт
показывает сообщение и перечитывает сценарий, без повторной отправки.

## Открытые вопросы

Вопросы по конструктору — в `docs/api/scenario-builder.md` и `docs/api/open-questions.md`,
раздел 11. Здесь — только то, что касается экранов списка и карточки:

1. **Владелец.** Правка, утверждение и архив чужого сценария сервер разрешает. Фронт скрывает эти
   действия, если `created_by` не совпадает с пользователем. Нужна серверная проверка.
2. **Роль сценария.** Сейчас выводится по составу. Предпочтение фронта — вычисленное поле
   `target_roles` в ответе списка.
3. **Использование.** «В моих занятиях» фронт считает по своим назначениям; чужие занятия не
   видны. Нужно `used_in_assignments`.
4. **Автор.** Имени автора нет, фронт показывает «Вы» или «Другой преподаватель».

## Требуется на бэкенде

| Приоритет | Что реализовать | Блокирует |
|---|---|---|
| P1 | Проверка владельца в PATCH и DELETE | защита чужих сценариев, сейчас только скрытием на клиенте |
| P1 | Снятие утверждения (`PUBLISHED → DRAFT` без активных назначений) | «утверждение можно снять» из требований заказчика |
| P1 | `target_roles` и `used_in_assignments` в списке | фильтры по роли и использованию без вывода на клиенте |
| P1 | Аудит утверждения и архивирования с причиной | требование безопасности о причине значимых действий преподавателя |
| P2 | Имя автора (`created_by_name`) в списке и карточке | колонка «Автор» с именем |
| P2 | Копия со связью «копия от» (`POST /training-scenarios/{id}/copy`) | история версий между копиями |
| P2 | Курсорная пагинация списка | сотни сценариев |
| P2 | Темп процедурной подачи по сложности в ответе | значения продублированы в `shared/config/procedural-pace.ts` |
| P2 | Названия `action_type` для `AFTER_ACTION` | неизвестный код показывается с пометкой «названия нет» |
