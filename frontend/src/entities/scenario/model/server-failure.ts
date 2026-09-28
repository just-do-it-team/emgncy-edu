import type { DraftIssue } from "./template-validation.ts";

const FORBIDDEN = 403;
const CONFLICT = 409;
const VALIDATION = 422;

export type ServerFailure =
  | { kind: "forbidden"; message: string }
  | { kind: "conflict"; message: string }
  | { kind: "validation"; issues: DraftIssue[] }
  | { kind: "other"; message: string };

export type LocMapper = (loc: (string | number)[]) => string;

interface ValidationDetail {
  loc: (string | number)[];
  msg: string;
}

function isValidationDetail(value: unknown): value is ValidationDetail {
  return (
    typeof value === "object" &&
    value !== null &&
    "loc" in value &&
    "msg" in value &&
    Array.isArray(value.loc) &&
    typeof value.msg === "string"
  );
}

export function forbiddenMessage(detail: unknown): string {
  return typeof detail === "string" && /template/i.test(detail)
    ? "Это может сделать только автор шаблона."
    : "Это может сделать только автор сценария.";
}

export function failureOf(status: number | undefined, detail: unknown, mapLoc: LocMapper): ServerFailure {
  const message = typeof detail === "string" && detail.trim() !== "" ? detail : null;

  if (status === FORBIDDEN) return { kind: "forbidden", message: forbiddenMessage(detail) };
  if (status === CONFLICT) return { kind: "conflict", message: message ?? "Данные изменились на сервере." };
  if (status === VALIDATION && Array.isArray(detail)) {
    return {
      kind: "validation",
      issues: detail.filter(isValidationDetail).map((item) => ({
        path: mapLoc(item.loc[0] === "body" ? item.loc.slice(1) : item.loc),
        message: `Сервер: ${item.msg}`,
        severity: "error",
      })),
    };
  }
  if (status === VALIDATION && message) {
    return { kind: "validation", issues: [{ path: "", message: `Сервер: ${message}`, severity: "error" }] };
  }

  return { kind: "other", message: message ?? "Сервер не выполнил действие. Повторите попытку позже." };
}

const cardFieldPaths: Record<string, string> = {
  classification: "recordId",
  services: "services",
  service_statuses: "services",
  current_status: "currentStatus",
  description: "fields.description",
  questionnaire: "fields.questions",
  applicant_full_name: "fields.applicantFullName",
  automatic_phone_number: "fields.automaticPhoneNumber",
  provided_phone_number: "fields.providedPhoneNumber",
  location_phone_number: "fields.locationPhoneNumber",
  reported_address: "fields.reportedAddress.street",
  incident_address: "fields.incidentAddress.street",
  victims_count: "fields.victimsCount",
};

export function expectedPathOf(loc: (string | number)[], prefix: string): string {
  const [block, field, ...rest] = loc;

  if (block === "card" && typeof field === "string") return `${prefix}.${cardFieldPaths[field] ?? "recordId"}`;
  if (block === "service_status_history") {
    return typeof field === "string" ? `${prefix}.history.${[field, ...rest].join(".")}` : `${prefix}.services`;
  }
  if (block === "outbound_call") return `${prefix}.outbound.expectedText`;

  return `${prefix}.recordId`;
}

export function scenarioPathOf(loc: (string | number)[]): string {
  const [head, second, index, field, ...rest] = loc;

  if (head === "definition" && second === "cards" && typeof index === "number") {
    if (field === "expected_result") return expectedPathOf(rest, `items.${index}.source.expected`);
    if (field === "trigger_config" || field === "trigger_type") return `items.${index}.trigger.itemKey`;

    return `items.${index}.source`;
  }
  if (head === "definition" && second === "procedural_generation") return "procedural.targetCount";
  if (head === "min_participants" || head === "max_participants") return "minParticipants";
  if (head === "passing_score") return "passingScore";
  if (head === "required_participant_positions") return "requiredPositions";
  if (typeof head === "string" && ["name", "description", "difficulty"].includes(head)) return head;

  return "items";
}
