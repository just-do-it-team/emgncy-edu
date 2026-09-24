# Вкладка обучаемого «История прохождения»

Основной метод вкладки возвращает только историю пользователя из заголовка и
не требует передавать его UUID в URL.

## Получить собственную историю

```http
GET /api/v1/student/training-history?status=COMPLETED&limit=50&offset=0
X-User-Id: <student-uuid>
```

Параметры:

- `status` — необязательный статус сессии: `CREATED`, `RUNNING`, `COMPLETED`,
  `ABORTED`, `TIMED_OUT`;
- `limit` — 1–200, по умолчанию 50;
- `offset` — смещение, по умолчанию 0.

Ответ пагинирован:

```json
{
  "items": [
    {
      "session_id": "session-uuid",
      "assignment_id": "assignment-uuid",
      "assignment_batch_id": "batch-uuid",
      "group_id": "group-uuid",
      "group_name": "Группа 101",
      "scenario_id": "scenario-uuid",
      "scenario_name": "Пожар в жилом доме",
      "attempt_number": 1,
      "status": "COMPLETED",
      "started_at": "2026-09-21T10:00:00Z",
      "completed_at": "2026-09-21T10:12:00Z",
      "automatic_score": "82.50",
      "automatic_passed": true,
      "automatic_result": {"cards": []},
      "expert_score": "90.00",
      "expert_passed": true,
      "final_score": "90.00",
      "final_passed": true,
      "expert_comment": "Хорошая работа",
      "expert_evaluated_by": "teacher-uuid",
      "expert_evaluated_at": "2026-09-21T12:00:00Z"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

`Decimal`-оценки сериализуются JSON-строками. Для шкалы и сортировки frontend
должен преобразовать их в число, не изменяя исходное значение для повторной
отправки.

Правила отображения:

- `final_score` и `final_passed` уже учитывают экспертную оценку: если она есть,
  используется она, иначе автоматическая;
- `null` у оценок означает, что сессия ещё не оценена, а не нулевой балл;
- `group_id` и `group_name` равны `null` для прямого назначения вне группы;
- `expert_comment=null` означает отсутствие комментария;
- для следующей страницы увеличивайте `offset` на фактическое число элементов,
  пока `offset + items.length < total`.

## Общие методы сессий

Для технического экрана доступны также:

- `GET /api/v1/training-sessions?participant_user_id={studentId}&status=...` —
  непагинированный список кратких сведений без `completion_state`, `result` и
  экспертного комментария;
- `GET /api/v1/training-sessions/{sessionId}` — полный объект одной сессии;
- `GET /api/v1/training-sessions/{sessionId}/actions` — хронология действий;
- `GET /api/v1/training-sessions/{sessionId}/scheduled-cards` — карточки плана.

Для основной вкладки следует использовать self-метод: он обогащён названием
сценария и группы и имеет стабильную пагинацию.

Для разбора своей завершённой или досрочно завершённой попытки доступен
`GET /api/v1/student/training-sessions/{sessionId}/result` с заголовком
`X-User-Id`. Ответ имеет поля элемента истории, включая `automatic_result`
и итоговую оценку. Чужая или отсутствующая сессия даёт `404`, незавершённая —
`409`. Для статусов `COMPLETED` и `ABORTED` рассчитанный `automatic_result`
доступен в истории; до завершения он равен `{}`.

## Ошибки

- `404` — пользователь не найден или заблокирован;
- `403` — `X-User-Id` принадлежит не роли `STUDENT`;
- `422` — неверный UUID заголовка или параметры пагинации.

`X-User-Id` — временный механизм до подключения общей аутентификации. Его нельзя
считать доказательством личности пользователя на публичном контуре.
