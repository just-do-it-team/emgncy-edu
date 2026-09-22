# Входящие учебные звонки

Список звонков сессии:

```http
GET /api/v1/training-sessions/{sessionId}/incoming-calls
```

После срабатывания триггера звонок переходит из `PENDING` в `RINGING`.
Обучаемый последовательно вызывает:

```http
POST /api/v1/incoming-calls/{callId}/answer
{"user_id":"student-uuid"}

POST /api/v1/incoming-calls/{callId}/incident-card
{"user_id":"student-uuid","incident_card_id":"created-card-uuid"}

POST /api/v1/incoming-calls/{callId}/complete
{"user_id":"student-uuid"}
```

Карточка создаётся существующим `POST /api/v1/cards` в workspace текущей
сессии с `operator_id`, равным `user_id` отвечающего обучаемого, а затем
привязывается ко звонку. Завершить звонок без карточки нельзя; уже выпущенную
сценарную карточку использовать вместо созданной оператором нельзя.

Полный цикл статусов: `PENDING → RINGING → ACTIVE → COMPLETED`. Незавершённый,
ошибочный или отменённый звонок блокирует завершение сессии. При итоговой оценке
`expected_result.card` сравнивается с привязанной итоговой карточкой, включая
`questionnaire`, если это поле задано в шаблоне. Содержание разговора и перечень
заданных вопросов отдельно не оцениваются. Старые шаблоны с `final_state` и
`required_actions` продолжают работать по прежней логике.

Поле `audio_message.training_call_id` уже предусмотрено для следующего шага —
привязки реплик STT/TTS к звонку до создания карточки происшествия.
