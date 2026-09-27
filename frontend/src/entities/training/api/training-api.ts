import axios from "axios";
import { api } from "@/shared/api";
import { STUDENT_API_URL, isUuid } from "../model/connection";
import type {
  CardStatusHistory,
  CardCreate,
  IncomingCall,
  OutgoingCall,
  ApiCard,
  Assignment,
  AudioMessage,
  CardFeatures,
  CardListPage,
  CardPatch,
  CompletionReadiness,
  EmergencyService,
  EventKind,
  HistoryPage,
  LaunchContext,
  ReferenceOption,
  ServiceHistory,
  StartedSession,
  TrainingSession,
  TtsSegment,
} from "../model/types";

function requestConfig(userId?: string) {
  if (userId !== undefined && !isUuid(userId))
    throw new Error(
      "Не удалось определить обучаемого. Войдите в систему повторно.",
    );
  return {
    baseURL: `${STUDENT_API_URL}/api/v1`,
    timeout: 20000,
    headers: userId ? { "X-User-Id": userId } : undefined,
  };
}
export function apiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    const messages: Record<string, string> = {
      "Assignment already has an active session":
        "Занятие уже запущено. Повторный запуск недоступен.",
      "Assignment is completed": "Назначение уже завершено.",
      "Maximum number of attempts has been reached":
        "Все доступные попытки использованы.",
      "Assignment is not available yet":
        "Время начала занятия ещё не наступило.",
      "Assignment deadline has passed": "Срок прохождения занятия истёк.",
      "User is not assigned to this scenario":
        "Это занятие не назначено текущему обучаемому.",
      "Training workspace is not active":
        "Занятие завершено или рабочее место неактивно. Обновите состояние занятия.",
      "Training session is not running":
        "Занятие уже не активно. Обновите его состояние.",
      "Only an active incoming call can be linked to a card":
        "Привязать карточку можно только к принятому звонку.",
      "Only a card created by the answering student can be linked":
        "Выберите карточку, созданную вами в этом занятии.",
      "A pre-created scenario card cannot be linked to an incoming call":
        "Карточку из сценария нельзя привязать к звонку. Создайте свою карточку.",
      "Incoming call is already linked to another card":
        "К звонку уже привязана другая карточка. Обновите данные занятия.",
      "Incident card is already linked to another incoming call":
        "Эта карточка уже привязана к другому звонку.",
      "Create and link an incident card before completing the call":
        "Перед завершением звонка создайте и привяжите карточку.",
      "Actor role is not allowed for this workspace operation":
        "Эта операция недоступна обучаемому на бэкенде.",
    };
    if (typeof detail === "string" && messages[detail]) return messages[detail];
    if (
      typeof detail === "string" &&
      (detail.startsWith("Incoming call cannot be answered from status") ||
        detail.startsWith("Incoming call cannot complete from status"))
    )
      return "Состояние звонка изменилось. Обновите данные занятия перед следующим действием.";
    if (error.response?.status === 409)
      return "Данные изменились или действие уже выполнено. Обновите карточку перед повторной записью. Введённые данные сохранены в форме.";
    if (error.response?.status === 403)
      return "Бэкенд не разрешает это действие для текущего обучаемого.";
    if (error.response?.status === 404)
      return "Объект не найден или больше недоступен.";
    if (error.response?.status === 422)
      return "Бэкенд отклонил данные. Проверьте обязательные поля и выбранные признаки.";
    if (!error.response) return "Нет ответа от API.";
    return `Ошибка API (${error.response.status}). Повторите загрузку.`;
  }
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить действие.";
}
export const trainingApi = {
  outgoingCall: async (
    ctx: LaunchContext,
    cardId: string,
    signal?: AbortSignal,
  ) =>
    (
      await api.get<OutgoingCall | null>(`/cards/${cardId}/outgoing-call`, {
        ...requestConfig(ctx.userId),
        signal,
      })
    ).data,
  startOutgoingCall: async (ctx: LaunchContext, cardId: string) =>
    (
      await api.post<OutgoingCall>(
        `/cards/${cardId}/outgoing-call`,
        { user_id: ctx.userId },
        requestConfig(ctx.userId),
      )
    ).data,
  completeOutgoingCall: async (ctx: LaunchContext, callId: string) =>
    (
      await api.post<OutgoingCall>(
        `/outgoing-calls/${callId}/complete`,
        { user_id: ctx.userId },
        requestConfig(ctx.userId),
      )
    ).data,
  incomingCalls: async (ctx: LaunchContext, signal?: AbortSignal) =>
    (
      await api.get<IncomingCall[]>(
        `/training-sessions/${ctx.sessionId}/incoming-calls`,
        {
          ...requestConfig(ctx.userId),
          signal,
        },
      )
    ).data,
  callAction: async (
    ctx: LaunchContext,
    callId: string,
    action: "answer" | "complete" | "incident-card",
    cardId?: string,
  ) =>
    (
      await api.post<IncomingCall>(
        `/incoming-calls/${callId}/${action}`,
        {
          user_id: ctx.userId,
          ...(cardId ? { incident_card_id: cardId } : {}),
        },
        requestConfig(ctx.userId),
      )
    ).data,
  createCard: async (ctx: LaunchContext, card: CardCreate) =>
    (
      await api.post<ApiCard>(
        "/cards",
        {
          ...card,
          workspace_id: ctx.workspaceId,
          operator_id: ctx.userId,
          source_type: "MANUAL",
          request_id: crypto.randomUUID(),
        },
        requestConfig(ctx.userId),
      )
    ).data,
  assignments: async (userId: string, signal?: AbortSignal) =>
    (
      await api.get<Assignment[]>("/student/scenario-assignments", {
        ...requestConfig(userId),
        signal,
      })
    ).data,
  assignment: async (
    id: string,
    userId: string,
    signal?: AbortSignal,
  ): Promise<Assignment> =>
    (
      await api.get<Assignment>(`/student/scenario-assignments/${id}`, {
        ...requestConfig(userId),
        signal,
      })
    ).data,
  sessions: async (userId: string, signal?: AbortSignal) =>
    (
      await api.get<TrainingSession[]>("/training-sessions", {
        params: { participant_user_id: userId },
        ...requestConfig(userId),
        signal,
      })
    ).data,
  session: async (
    ctx: Pick<LaunchContext, "userId" | "sessionId">,
    signal?: AbortSignal,
  ) =>
    (
      await api.get<TrainingSession>(`/training-sessions/${ctx.sessionId}`, {
        ...requestConfig(ctx.userId),
        signal,
      })
    ).data,
  presence: async (ctx: LaunchContext, signal?: AbortSignal) => {
    await api.post(`/training-sessions/${ctx.sessionId}/presence`, null, {
      ...requestConfig(ctx.userId),
      signal,
    });
  },
  start: async (userId: string, assignmentId: string, key: string) =>
    (
      await api.post<StartedSession>(
        `/scenario-assignments/${assignmentId}/start`,
        { user_id: userId },
        {
          ...requestConfig(userId),
          headers: { "X-User-Id": userId, "Idempotency-Key": key },
        },
      )
    ).data,
  readiness: async (ctx: LaunchContext, signal?: AbortSignal) =>
    (
      await api.get<CompletionReadiness>(
        `/training-sessions/${ctx.sessionId}/completion-readiness`,
        { ...requestConfig(ctx.userId), signal },
      )
    ).data,
  complete: async (ctx: LaunchContext) =>
    (
      await api.post<TrainingSession>(
        `/training-sessions/${ctx.sessionId}/complete`,
        { user_id: ctx.userId },
        { ...requestConfig(ctx.userId) },
      )
    ).data,
  abort: async (ctx: LaunchContext) =>
    (
      await api.post<TrainingSession>(
        `/training-sessions/${ctx.sessionId}/abort`,
        { user_id: ctx.userId },
        { ...requestConfig(ctx.userId) },
      )
    ).data,
  cards: async (
    ctx: LaunchContext,
    cursor: string | null,
    signal?: AbortSignal,
  ) =>
    (
      await api.get<CardListPage>(`/workspaces/${ctx.workspaceId}/cards`, {
        params: { limit: 100, cursor: cursor ?? undefined },
        ...requestConfig(ctx.userId),
        signal,
      })
    ).data,
  card: async (ctx: LaunchContext, id: string, signal?: AbortSignal) =>
    (
      await api.get<ApiCard>(`/workspaces/${ctx.workspaceId}/cards/${id}`, {
        ...requestConfig(ctx.userId),
        signal,
      })
    ).data,
  open: async (ctx: LaunchContext, id: string) => {
    await api.post(`/workspaces/${ctx.workspaceId}/cards/${id}/open`, null, {
      ...requestConfig(ctx.userId),
    });
  },
  patch: async (ctx: LaunchContext, card: ApiCard, patch: CardPatch) =>
    (
      await api.patch<ApiCard>(
        `/cards/${card.id}`,
        {
          ...patch,
          expected_version: card.version,
          actor_id: ctx.userId,
          request_id: crypto.randomUUID(),
        },
        { ...requestConfig(ctx.userId) },
      )
    ).data,
  features: async (
    ctx: LaunchContext,
    card: ApiCard,
    features: CardFeatures,
  ) => {
    await api.put(
      `/cards/${card.id}/features`,
      {
        ...features,
        expected_card_version: card.version,
        actor_id: ctx.userId,
        request_id: crypto.randomUUID(),
      },
      { ...requestConfig(ctx.userId) },
    );
  },
  cardStatus: async (
    ctx: LaunchContext,
    card: ApiCard,
    status: string,
    reason: string,
  ) =>
    (
      await api.post<ApiCard>(
        `/cards/${card.id}/statuses`,
        {
          status,
          reason: reason || null,
          expected_card_version: card.version,
          actor_id: ctx.userId,
          request_id: crypto.randomUUID(),
        },
        { ...requestConfig(ctx.userId) },
      )
    ).data,
  cardStatusHistory: async (
    ctx: LaunchContext,
    cardId: string,
    signal?: AbortSignal,
  ) =>
    (
      await api.get<CardStatusHistory[]>(`/cards/${cardId}/status-history`, {
        ...requestConfig(ctx.userId),
        signal,
      })
    ).data,
  addService: async (ctx: LaunchContext, card: ApiCard, serviceId: string) => {
    await api.post(
      `/cards/${card.id}/services`,
      {
        service_id: serviceId,
        expected_card_version: card.version,
        actor_id: ctx.userId,
        request_id: crypto.randomUUID(),
      },
      { ...requestConfig(ctx.userId) },
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
      await api.post(
        `/workspaces/${ctx.workspaceId}/cards/${card.id}/decision`,
        {
          decision: status,
          comment: comment || null,
          request_id: crypto.randomUUID(),
        },
        { ...requestConfig(ctx.userId) },
      );
    } else {
      await api.post(
        `/card-services/${serviceId}/statuses`,
        {
          status,
          comment: comment || null,
          expected_card_version: card.version,
          occurred_at: new Date().toISOString(),
          author_id: ctx.userId,
          request_id: crypto.randomUUID(),
        },
        { ...requestConfig(ctx.userId) },
      );
    }
  },
  serviceHistory: async (
    ctx: LaunchContext,
    serviceId: string,
    signal?: AbortSignal,
  ) =>
    (
      await api.get<ServiceHistory[]>(
        `/card-services/${serviceId}/status-history`,
        { ...requestConfig(ctx.userId), signal },
      )
    ).data,
  history: async (
    userId: string,
    limit: number,
    offset: number,
    signal?: AbortSignal,
  ) =>
    (
      await api.get<HistoryPage>("/student/training-history", {
        params: { limit, offset },
        ...requestConfig(userId),
        signal,
      })
    ).data,
  services: async (signal?: AbortSignal) =>
    (
      await api.get<EmergencyService[]>("/services", {
        ...requestConfig(),
        signal,
      })
    ).data,
  eventTypes: async (signal?: AbortSignal) =>
    (
      await api.get<ReferenceOption[]>("/event-types", {
        ...requestConfig(),
        signal,
      })
    ).data,
  eventKinds: async (typeId: number, signal?: AbortSignal) =>
    (
      await api.get<EventKind[]>(`/event-types/${typeId}/event-kinds`, {
        ...requestConfig(),
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
    return (
      await api.get<ReferenceOption[]>(`/${paths[level]}`, {
        ...requestConfig(),
        signal,
      })
    ).data;
  },
  audioMessages: async (
    ctx: LaunchContext,
    cardId: string,
    signal?: AbortSignal,
  ) =>
    (
      await api.get<AudioMessage[]>(
        `/workspaces/${ctx.workspaceId}/cards/${cardId}/audio-messages`,
        { ...requestConfig(ctx.userId), signal },
      )
    ).data,
  callAudioConfig: async (signal?: AbortSignal) =>
    (
      await api.get<{ vad_silence_ms: number }>("/call-audio-config", {
        ...requestConfig(),
        signal,
      })
    ).data,
  uploadCallAudio: async (
    ctx: LaunchContext,
    callId: string,
    audio: Blob,
    key: string,
  ) => {
    const form = new FormData();
    const extension =
      audio.type === "audio/ogg"
        ? "ogg"
        : audio.type === "audio/mp4"
          ? "m4a"
          : "webm";
    form.append(
      "audio",
      audio,
      `${ctx.mode === "DDS" ? "dds" : "operator-112"}.${extension}`,
    );
    form.append("client_sent_at", new Date().toISOString());
    return (
      await api.post<AudioMessage>(
        `/workspaces/${ctx.workspaceId}/${ctx.mode === "DDS" ? "outgoing-calls" : "incoming-calls"}/${callId}/audio-messages`,
        form,
        {
          ...requestConfig(ctx.userId),
          timeout: 60000,
          headers: { "X-User-Id": ctx.userId, "Idempotency-Key": key },
        },
      )
    ).data;
  },
  callAudioMessages: async (
    ctx: LaunchContext,
    callId: string,
    signal?: AbortSignal,
  ) =>
    (
      await api.get<AudioMessage[]>(
        `/workspaces/${ctx.workspaceId}/${ctx.mode === "DDS" ? "outgoing-calls" : "incoming-calls"}/${callId}/audio-messages`,
        { ...requestConfig(ctx.userId), signal },
      )
    ).data,
  ttsSegments: async (userId: string, messageId: string) =>
    (
      await api.get<TtsSegment[]>(`/audio-messages/${messageId}/tts-segments`, {
        ...requestConfig(userId),
      })
    ).data,
  ttsSegmentContent: async (userId: string, segmentId: string) =>
    (
      await api.get<Blob>(`/tts-segments/${segmentId}/content`, {
        ...requestConfig(userId),
        responseType: "blob",
      })
    ).data,
  audioContent: async (userId: string, id: string, signal?: AbortSignal) =>
    (
      await api.get<Blob>(`/audio-messages/${id}/content`, {
        ...requestConfig(userId),
        responseType: "blob",
        signal,
      })
    ).data,
};
