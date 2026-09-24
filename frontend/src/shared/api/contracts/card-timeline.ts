export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ResponseStatus =
  | "ADDED"
  | "NOT_NOTIFIED"
  | "RECEIVED"
  | "ACCEPTED"
  | "REJECTED"
  | "RESPONSE_STARTED"
  | "ARRIVED"
  | "WORK_IN_PROGRESS"
  | "WORK_COMPLETED"
  | "WORK_REFUSED";

export type CardDecision = "ACCEPTED" | "REJECTED";

export type CardTimelineEventKind =
  | "CARD_OPENED"
  | "FIELD_SET"
  | "SERVICE_ADDED"
  | "STATUS_CHANGED"
  | "DECISION";

export interface CardTimelineEventDto {
  offset_ms: number;
  kind: CardTimelineEventKind;
  path?: string;
  value?: JsonValue;
  previous?: JsonValue;
  service_id?: string;
  card_service_id?: string;
  from?: ResponseStatus;
  to?: ResponseStatus;
  decision?: CardDecision;
  comment?: string | null;
}

export interface CardTimelineDto {
  utterances_offset_base: string;
  events: CardTimelineEventDto[];
}

interface CardTimelineEventBase {
  offsetMs: number;
}

export interface CardOpenedEvent extends CardTimelineEventBase {
  kind: "CARD_OPENED";
}

export interface FieldSetEvent extends CardTimelineEventBase {
  kind: "FIELD_SET";
  path: string;
  value: JsonValue;
  previous: JsonValue;
}

export interface ServiceAddedEvent extends CardTimelineEventBase {
  kind: "SERVICE_ADDED";
  serviceId: string;
  cardServiceId: string;
}

export interface StatusChangedEvent extends CardTimelineEventBase {
  kind: "STATUS_CHANGED";
  cardServiceId: string;
  from: ResponseStatus;
  to: ResponseStatus;
  comment: string | null;
}

export interface DecisionEvent extends CardTimelineEventBase {
  kind: "DECISION";
  cardServiceId: string;
  decision: CardDecision;
  comment: string | null;
}

export type CardTimelineEvent =
  | CardOpenedEvent
  | FieldSetEvent
  | ServiceAddedEvent
  | StatusChangedEvent
  | DecisionEvent;

export interface CardTimeline {
  utterancesOffsetBase: string;
  events: CardTimelineEvent[];
}

function present<T>(value: T | undefined, event: CardTimelineEventDto, field: string): T {
  if (value === undefined) {
    throw new Error(
      `Таймлайн карточки: событие ${event.kind} на ${event.offset_ms} мс пришло без поля ${field}`,
    );
  }

  return value;
}

function toCardTimelineEvent(event: CardTimelineEventDto): CardTimelineEvent {
  const offsetMs = event.offset_ms;

  switch (event.kind) {
    case "CARD_OPENED":
      return { kind: "CARD_OPENED", offsetMs };
    case "FIELD_SET":
      return {
        kind: "FIELD_SET",
        offsetMs,
        path: present(event.path, event, "path"),
        value: present(event.value, event, "value"),
        previous: event.previous ?? null,
      };
    case "SERVICE_ADDED":
      return {
        kind: "SERVICE_ADDED",
        offsetMs,
        serviceId: present(event.service_id, event, "service_id"),
        cardServiceId: present(event.card_service_id, event, "card_service_id"),
      };
    case "STATUS_CHANGED":
      return {
        kind: "STATUS_CHANGED",
        offsetMs,
        cardServiceId: present(event.card_service_id, event, "card_service_id"),
        from: present(event.from, event, "from"),
        to: present(event.to, event, "to"),
        comment: event.comment ?? null,
      };
    case "DECISION":
      return {
        kind: "DECISION",
        offsetMs,
        cardServiceId: present(event.card_service_id, event, "card_service_id"),
        decision: present(event.decision, event, "decision"),
        comment: event.comment ?? null,
      };
  }
}

export function toCardTimeline(dto: CardTimelineDto): CardTimeline {
  return {
    utterancesOffsetBase: dto.utterances_offset_base,
    events: dto.events
      .map(toCardTimelineEvent)
      .sort((first, second) => first.offsetMs - second.offsetMs),
  };
}
