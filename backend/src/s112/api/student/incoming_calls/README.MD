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
заданных вопросов отдельно не оцениваются: call-scoped STT/TTS через
`audio_message.training_call_id` нужны для воспроизведения диалога и ожидания
окончания обработки речи. Старые шаблоны с `final_state` и `required_actions`
продолжают работать по прежней логике.

## Разговор после принятия звонка

Клиент запрашивает `GET /api/v1/call-audio-config` и использует
`vad_silence_ms` (по умолчанию 600 мс) для автоматического завершения реплики.
Значение задаётся через `S112_CALL_VAD_SILENCE_MS` в `backend/.env`.
Микрофон записывает целую реплику; клиент отправляет её в
`POST /api/v1/workspaces/{workspaceId}/incoming-calls/{callId}/audio-messages`
с постоянным `Idempotency-Key` при повторных попытках. Следующую реплику
клиент начинает записывать после окончания воспроизведения всех сегментов
ответа собеседника.

После STT `dialogue-worker` использует историю звонка и
`call_payload.initial_utterance` как контекст заявителя. Поток LLM разбивается
на короткие фразы: первые две выделяются раньше последующих. Каждая фраза
сохраняется в `tts_segment` вместе с outbox-заданием для TTS. После сохранения
аудио в SeaweedFS результат проходит через result-outbox и Kafka; SSE-событие
`training.tts_segment_ready` содержит `segment_no` и `content_url`.
Аудиобайты клиент получает по авторизованному
`GET /api/v1/tts-segments/{segmentId}/content`. Полный список для восстановления
после разрыва SSE: `GET /api/v1/audio-messages/{messageId}/tts-segments`.
Событие `training.dialogue_finished` сообщает итоговое число сегментов.
После привязки карточки её список аудиосообщений включает и ранее записанные
реплики этого звонка.

Для локального интерфейса скопируйте `frontend/.env.example` в `frontend/.env`
и задайте идентификаторы учебной сессии, workspace и Обучаемого. При наличии
`VITE_TRAINING_SESSION_ID` frontend переключается на окно входящего звонка.
LLM задаётся в `backend/.env`: `S112_DIALOGUE_LLM_BASE_URL` (OpenAI-совместимый
`/v1` endpoint), `S112_DIALOGUE_LLM_MODEL`, при необходимости
`S112_DIALOGUE_LLM_API_KEY`. Модель LLM должна быть доступна для
`dialogue-worker`. Изменение переменных Vite требует перезапуска frontend,
а переменных Compose — пересоздания соответствующих контейнеров.
