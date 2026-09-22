import axios from "axios";
import { STUDENT_API_URL, isUuid } from "../model/connection";
import type {
  CardStatusHistory,
  ApiCard,
  Assignment,
  AudioMessage,
  CardFeatures,
  CardListItem,
  CardPatch,
  CompletionReadiness,
  EmergencyService,
  EventKind,
  FeatureSchema,
  HistoryPage,
  LaunchContext,
  ReferenceOption,
  ScenarioInfo,
  ServiceHistory,
  StartedSession,
  TrainingSession,
} from "../model/types";

const client = axios.create({
  baseURL: `${STUDENT_API_URL}/api/v1`,
  timeout: 20000,
});
function identity(userId: string) {
  if (!isUuid(userId))
    throw new Error("Укажите UUID обучающегося для подключения к API.");
  return { "X-User-Id": userId };
}
export function apiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    const messages: Record<string, string> = {
      "Assignment already has an active session":
        "Занятие уже запущено. Откройте его в браузере, где начинали обучение: API пока не возвращает рабочее место в списке сессий.",
      "Assignment is completed": "Назначение уже завершено.",
      "Maximum number of attempts has been reached":
        "Все доступные попытки использованы.",
      "Assignment is not available yet":
        "Время начала занятия ещё не наступило.",
      "Assignment deadline has passed": "Срок прохождения занятия истёк.",
      "User is not assigned to this scenario":
        "Это занятие не назначено выбранному обучающемуся.",
      "Training workspace is not active":
        "Занятие завершено или рабочее место неактивно. Обновите состояние занятия.",
      "Actor role is not allowed for this workspace operation":
        "Эта операция недоступна обучающемуся на бэкенде.",
    };
    if (typeof detail === "string" && messages[detail]) return messages[detail];
    if (error.response?.status === 409)
      return "Данные изменились или действие уже выполнено. Обновите карточку перед повторной записью. Введённые данные сохранены в форме.";
    if (error.response?.status === 403)
      return "Бэкенд не разрешает это действие для выбранного обучающегося.";
    if (error.response?.status === 404)
      return "Объект не найден или больше недоступен.";
    if (error.response?.status === 422)
      return "Бэкенд отклонил данные. Проверьте обязательные поля и выбранные признаки.";
    if (!error.response)
      return "Нет ответа от API. Проверьте соединение. Результат последней записи может быть неизвестен — обновите данные перед повтором.";
    return `Ошибка API (${error.response.status}). Повторите загрузку.`;
  }
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить действие.";
}
export const trainingApi = {
  assignments: async (userId: string, signal?: AbortSignal) =>
    (
      await client.get<Assignment[]>("/scenario-assignments", {
        params: { participant_user_id: userId },
        headers: identity(userId),
        signal,
      })
    ).data,
  scenario: async (
    id: string,
    userId: string,
    signal?: AbortSignal,
  ): Promise<ScenarioInfo> => {
    const { data } = await client.get<ScenarioInfo>(
      `/training-scenarios/${id}`,
      { headers: identity(userId), signal },
    );
    // Do not put the scenario definition / expected answers into the student query cache.
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      difficulty: data.difficulty,
      estimated_duration_seconds: data.estimated_duration_seconds,
      cards_count: data.cards_count,
    };
  },
  sessions: async (userId: string, signal?: AbortSignal) =>
    (
      await client.get<TrainingSession[]>("/training-sessions", {
        params: { participant_user_id: userId },
        headers: identity(userId),
        signal,
      })
    ).data,
  start: async (userId: string, assignmentId: string, key: string) =>
    (
      await client.post<StartedSession>(
        `/scenario-assignments/${assignmentId}/start`,
        { user_id: userId },
        { headers: { ...identity(userId), "Idempotency-Key": key } },
      )
    ).data,
  readiness: async (ctx: LaunchContext, signal?: AbortSignal) =>
    (
      await client.get<CompletionReadiness>(
        `/training-sessions/${ctx.sessionId}/completion-readiness`,
        { headers: identity(ctx.userId), signal },
      )
    ).data,
  complete: async (ctx: LaunchContext) =>
    (
      await client.post<TrainingSession>(
        `/training-sessions/${ctx.sessionId}/complete`,
        { user_id: ctx.userId },
        { headers: identity(ctx.userId) },
      )
    ).data,
  cards: async (ctx: LaunchContext, signal?: AbortSignal) =>
    (
      await client.get<CardListItem[]>(`/workspaces/${ctx.workspaceId}/cards`, {
        params: { limit: 500 },
        headers: identity(ctx.userId),
        signal,
      })
    ).data,
  card: async (ctx: LaunchContext, id: string, signal?: AbortSignal) =>
    (
      await client.get<ApiCard>(`/workspaces/${ctx.workspaceId}/cards/${id}`, {
        headers: identity(ctx.userId),
        signal,
      })
    ).data,
  open: async (ctx: LaunchContext, id: string) => {
    await client.post(`/workspaces/${ctx.workspaceId}/cards/${id}/open`, null, {
      headers: identity(ctx.userId),
    });
  },
  patch: async (ctx: LaunchContext, card: ApiCard, patch: CardPatch) =>
    (
      await client.patch<ApiCard>(
        `/cards/${card.id}`,
        {
          ...patch,
          expected_version: card.version,
          actor_id: ctx.userId,
          request_id: crypto.randomUUID(),
        },
        { headers: identity(ctx.userId) },
      )
    ).data,
  features: async (
    ctx: LaunchContext,
    card: ApiCard,
    features: CardFeatures,
  ) => {
    await client.put(
      `/cards/${card.id}/features`,
      {
        ...features,
        expected_card_version: card.version,
        actor_id: ctx.userId,
        request_id: crypto.randomUUID(),
      },
      { headers: identity(ctx.userId) },
    );
  },
  cardStatus: async (
    ctx: LaunchContext,
    card: ApiCard,
    status: string,
    reason: string,
  ) =>
    (
      await client.post<ApiCard>(
        `/cards/${card.id}/statuses`,
        {
          status,
          reason: reason || null,
          expected_card_version: card.version,
          actor_id: ctx.userId,
          request_id: crypto.randomUUID(),
        },
        { headers: identity(ctx.userId) },
      )
    ).data,
  cardStatusHistory: async (
    ctx: LaunchContext,
    cardId: string,
    signal?: AbortSignal,
  ) =>
    (
      await client.get<CardStatusHistory[]>(`/cards/${cardId}/status-history`, {
        headers: identity(ctx.userId),
        signal,
      })
    ).data,
  addService: async (ctx: LaunchContext, card: ApiCard, serviceId: string) => {
    await client.post(
      `/cards/${card.id}/services`,
      {
        service_id: serviceId,
        expected_card_version: card.version,
        actor_id: ctx.userId,
        request_id: crypto.randomUUID(),
      },
      { headers: identity(ctx.userId) },
    );
  },
  serviceStatus: async (
    ctx: LaunchContext,
    card: ApiCard,
    serviceId: string,
    status: string,
    comment: string,
  ) => {
    if (status === "RECEIVED") return trainingApi.open(ctx, card.id);
    if (status === "ACCEPTED" || status === "REJECTED") {
      await client.post(
        `/workspaces/${ctx.workspaceId}/cards/${card.id}/decision`,
        {
          decision: status,
          comment: comment || null,
          request_id: crypto.randomUUID(),
        },
        { headers: identity(ctx.userId) },
      );
    } else {
      await client.post(
        `/card-services/${serviceId}/statuses`,
        {
          status,
          comment: comment || null,
          expected_card_version: card.version,
          occurred_at: new Date().toISOString(),
          author_id: ctx.userId,
          request_id: crypto.randomUUID(),
        },
        { headers: identity(ctx.userId) },
      );
    }
  },
  serviceHistory: async (
    ctx: LaunchContext,
    serviceId: string,
    signal?: AbortSignal,
  ) =>
    (
      await client.get<ServiceHistory[]>(
        `/card-services/${serviceId}/status-history`,
        { headers: identity(ctx.userId), signal },
      )
    ).data,
  history: async (userId: string, offset: number, signal?: AbortSignal) =>
    (
      await client.get<HistoryPage>("/student/training-history", {
        params: { limit: 20, offset },
        headers: identity(userId),
        signal,
      })
    ).data,
  services: async (signal?: AbortSignal) =>
    (await client.get<EmergencyService[]>("/services", { signal })).data,
  eventTypes: async (signal?: AbortSignal) =>
    (await client.get<ReferenceOption[]>("/event-types", { signal })).data,
  eventKinds: async (typeId: number, signal?: AbortSignal) =>
    (
      await client.get<EventKind[]>(`/event-types/${typeId}/event-kinds`, {
        signal,
      })
    ).data,
  featureOptions: async (
    level: number,
    parentId: number,
    signal?: AbortSignal,
  ) => {
    const paths = [
      `event-kinds/${parentId}/first-order-features`,
      `first-order-features/${parentId}/second-order-features`,
      `second-order-features/${parentId}/third-order-features`,
    ];
    return (await client.get<ReferenceOption[]>(`/${paths[level]}`, { signal }))
      .data;
  },
  schema: async (features: CardFeatures, signal?: AbortSignal) => {
    try {
      return (
        await client.get<FeatureSchema>("/feature-schemas/resolve", {
          params: {
            event_kind_id: features.event_kind_id,
            first_order_feature_id: features.first_order_feature_id,
            second_order_feature_id: features.second_order_feature_id,
            third_order_feature_id: features.third_order_feature_id,
          },
          signal,
        })
      ).data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404)
        return null;
      throw error;
    }
  },
  audioMessages: async (
    ctx: LaunchContext,
    cardId: string,
    signal?: AbortSignal,
  ) =>
    (
      await client.get<AudioMessage[]>(
        `/workspaces/${ctx.workspaceId}/cards/${cardId}/audio-messages`,
        { headers: identity(ctx.userId), signal },
      )
    ).data,
  audioContent: async (userId: string, id: string, signal?: AbortSignal) =>
    (
      await client.get<Blob>(`/audio-messages/${id}/content`, {
        headers: identity(userId),
        responseType: "blob",
        signal,
      })
    ).data,
};
