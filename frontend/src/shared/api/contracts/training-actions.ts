import type { JsonObject, JsonValue } from "./json";

export type TrainingActionResult = "SUCCESS" | "REJECTED" | "ERROR";

export interface TrainingActionDto {
  id: string;
  training_session_id: string;
  workspace_id: string;
  actor_user_id: string | null;
  incident_card_id: string | null;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  occurred_at: string;
  result: TrainingActionResult;
  before_state: JsonObject | null;
  after_state: JsonObject | null;
  details: JsonObject;
}

export interface FieldChange {
  field: string;
  before: JsonValue;
  after: JsonValue;
}

interface ActionEventBase {
  id: string;
  actionType: string;
  occurredAt: string;
  callOffsetMs: number | null;
  actorUserId: string | null;
  incidentCardId: string | null;
  entityId: string | null;
}

export type ActionEventBody =
    | { kind: "card_created"; releasedByScenario: boolean }
    | {
        kind: "card_updated";
        changes: FieldChange[];
        declaredButUnchanged: string[];
        undeclaredChanges: string[];
      }
    | { kind: "classification_updated"; changes: FieldChange[] }
    | { kind: "card_status_changed"; from: string | null; to: string | null; reason: string | null }
    | {
        kind: "service_added";
        serviceId: string | null;
        cardServiceId: string | null;
        addedReason: string | null;
      }
    | { kind: "card_opened"; serviceId: string | null; onTime: boolean | null }
    | {
        kind: "service_decision";
        serviceId: string | null;
        decision: "ACCEPTED" | "REJECTED";
        comment: string | null;
        onTime: boolean | null;
      }
    | {
        kind: "service_status_changed";
        serviceId: string | null;
        from: string | null;
        to: string | null;
        comment: string | null;
      }
    | {
        kind: "deadline_missed";
        deadline: "open" | "decision";
        serviceId: string | null;
        deadlineAt: string | null;
      }
    | { kind: "call"; stage: "ringing" | "answered" | "card_linked" | "completed" }
    | { kind: "session"; stage: "started" | "completed" | "aborted" | "expert_assessment" }
    | { kind: "transcribed"; transcript: string | null }
    | {
        kind: "outbound_evaluation";
        stage: "requested" | "evaluated";
        outcome: TrainingActionResult;
      }
    | { kind: "rejected"; outcome: "REJECTED" | "ERROR"; error: string | null }
    | { kind: "unknown" };

export type ActionEvent = ActionEventBase & ActionEventBody;

const IGNORED_CARD_FIELDS = new Set(["version"]);

const callStages = {
  INCOMING_CALL_RINGING: "ringing",
  INCOMING_CALL_ANSWERED: "answered",
  INCIDENT_CARD_CREATED_FROM_CALL: "card_linked",
  INCOMING_CALL_COMPLETED: "completed",
} as const;

const sessionStages = {
  SESSION_STARTED: "started",
  SESSION_COMPLETED: "completed",
  SESSION_ABORTED: "aborted",
  EXPERT_ASSESSMENT_UPDATED: "expert_assessment",
} as const;

function jsonEqual(first: JsonValue | undefined, second: JsonValue | undefined): boolean {
  if (first === second) return true;
  if (first === undefined || second === undefined || first === null || second === null) {
    return false;
  }
  if (Array.isArray(first) || Array.isArray(second)) {
    return (
      Array.isArray(first) &&
      Array.isArray(second) &&
      first.length === second.length &&
      first.every((item, index) => jsonEqual(item, second[index]))
    );
  }
  if (typeof first !== "object" || typeof second !== "object") return false;

  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);

  return [...keys].every((key) => jsonEqual(first[key], second[key]));
}

function diff(before: JsonObject | null, after: JsonObject | null): FieldChange[] {
  const previous = before ?? {};
  const next = after ?? {};
  const fields = new Set([...Object.keys(previous), ...Object.keys(next)]);

  return [...fields]
    .filter((field) => !IGNORED_CARD_FIELDS.has(field))
    .filter((field) => !jsonEqual(previous[field], next[field]))
    .sort()
    .map((field) => ({ field, before: previous[field] ?? null, after: next[field] ?? null }));
}

function text(source: JsonObject | null, key: string): string | null {
  const value = source?.[key];

  return typeof value === "string" ? value : null;
}

function flag(source: JsonObject | null, key: string): boolean | null {
  const value = source?.[key];

  return typeof value === "boolean" ? value : null;
}

function texts(source: JsonObject, key: string): string[] {
  const value = source[key];

  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function cardUpdated(dto: TrainingActionDto): ActionEventBody {
  const changes = diff(dto.before_state, dto.after_state);
  const changed = new Set(changes.map((change) => change.field));
  const declared = texts(dto.details, "changed_fields");

  return {
    kind: "card_updated",
    changes,
    declaredButUnchanged: declared.filter((field) => !changed.has(field)),
    undeclaredChanges: [...changed].filter((field) => !declared.includes(field)),
  };
}

function eventBody(dto: TrainingActionDto): ActionEventBody {
  if (dto.action_type === "OUTBOUND_CALL_EVALUATED") {
    return { kind: "outbound_evaluation", stage: "evaluated", outcome: dto.result };
  }
  if (dto.result !== "SUCCESS") {
    return { kind: "rejected", outcome: dto.result, error: text(dto.details, "error") };
  }

  switch (dto.action_type) {
    case "CARD_CREATED":
    case "CARD_RELEASED":
      return { kind: "card_created", releasedByScenario: dto.action_type === "CARD_RELEASED" };
    case "CARD_UPDATED":
      return cardUpdated(dto);
    case "CARD_FEATURES_UPDATED":
      return { kind: "classification_updated", changes: diff(dto.before_state, dto.after_state) };
    case "CARD_STATUS_CHANGED":
      return {
        kind: "card_status_changed",
        from: text(dto.before_state, "current_status"),
        to: text(dto.after_state, "current_status"),
        reason: text(dto.details, "reason"),
      };
    case "CARD_SERVICE_ADDED":
      return {
        kind: "service_added",
        serviceId: text(dto.after_state, "service_id"),
        cardServiceId: text(dto.after_state, "card_service_id"),
        addedReason: text(dto.after_state, "added_reason"),
      };
    case "CARD_OPENED":
      return {
        kind: "card_opened",
        serviceId: text(dto.details, "service_id"),
        onTime: flag(dto.details, "opened_on_time"),
      };
    case "CARD_ACCEPTED":
    case "CARD_REJECTED":
      return {
        kind: "service_decision",
        serviceId: text(dto.details, "service_id"),
        decision: dto.action_type === "CARD_ACCEPTED" ? "ACCEPTED" : "REJECTED",
        comment: text(dto.details, "comment"),
        onTime: flag(dto.details, "decided_on_time"),
      };
    case "SERVICE_STATUS_CHANGED":
      return {
        kind: "service_status_changed",
        serviceId: text(dto.details, "service_id"),
        from: text(dto.before_state, "status"),
        to: text(dto.after_state, "status"),
        comment: text(dto.details, "comment"),
      };
    case "CARD_OPEN_DEADLINE_MISSED":
    case "CARD_DECISION_DEADLINE_MISSED":
      return {
        kind: "deadline_missed",
        deadline: dto.action_type === "CARD_OPEN_DEADLINE_MISSED" ? "open" : "decision",
        serviceId: text(dto.details, "service_id"),
        deadlineAt: text(dto.details, "deadline_at"),
      };
    case "INCOMING_CALL_RINGING":
    case "INCOMING_CALL_ANSWERED":
    case "INCIDENT_CARD_CREATED_FROM_CALL":
    case "INCOMING_CALL_COMPLETED":
      return { kind: "call", stage: callStages[dto.action_type] };
    case "SESSION_STARTED":
    case "SESSION_COMPLETED":
    case "SESSION_ABORTED":
    case "EXPERT_ASSESSMENT_UPDATED":
      return { kind: "session", stage: sessionStages[dto.action_type] };
    case "AUDIO_MESSAGE_TRANSCRIBED":
      return { kind: "transcribed", transcript: text(dto.details, "transcript") };
    case "OUTBOUND_CALL_EVALUATION_REQUESTED":
      return { kind: "outbound_evaluation", stage: "requested", outcome: dto.result };
    default:
      return { kind: "unknown" };
  }
}

export function toActionTimeline(
  dtos: TrainingActionDto[],
  answeredAt: string | null,
): ActionEvent[] {
  const origin = answeredAt === null ? Number.NaN : Date.parse(answeredAt);

  return dtos
    .map((dto): ActionEvent => {
      const offset = Date.parse(dto.occurred_at) - origin;

      return {
        id: dto.id,
        actionType: dto.action_type,
        occurredAt: dto.occurred_at,
        callOffsetMs: Number.isFinite(offset) ? offset : null,
        actorUserId: dto.actor_user_id,
        incidentCardId: dto.incident_card_id,
        entityId: dto.entity_id,
        ...eventBody(dto),
      };
    })
    .sort((first, second) => Date.parse(first.occurredAt) - Date.parse(second.occurredAt));
}
