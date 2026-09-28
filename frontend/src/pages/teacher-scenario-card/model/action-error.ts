import { forbiddenMessage } from "@/entities/scenario";
import { errorDetail, errorStatus } from "@/shared/api";

const FORBIDDEN = 403;
const CONFLICT = 409;
const VALIDATION = 422;

const SCENARIO_FIELD_LABELS: Record<string, string> = {
  name: "Название",
  difficulty: "Сложность",
  estimated_duration_seconds: "Длительность",
  workspace_mode: "Рабочее место",
  completion_policy: "Завершение",
  min_participants: "Участников не меньше",
  max_participants: "Участников не больше",
  status: "Статус",
  definition: "Состав",
};

export type ScenarioActionError =
  | { kind: "forbidden"; message: string }
  | { kind: "conflict" }
  | { kind: "validation"; issues: string[] }
  | { kind: "other"; message: string };

interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  return (
    typeof value === "object" &&
    value !== null &&
    "loc" in value &&
    "msg" in value &&
    Array.isArray(value.loc) &&
    typeof value.msg === "string"
  );
}

function issueText({ loc, msg }: ValidationIssue, itemLabels: string[]): string {
  const path = loc[0] === "body" ? loc.slice(1) : loc;
  const cardsIndex = path.indexOf("cards");
  const itemIndex = cardsIndex >= 0 ? path[cardsIndex + 1] : undefined;

  if (typeof itemIndex === "number") {
    const rest = path.slice(cardsIndex + 2).join(".");
    const label = itemLabels[itemIndex] ?? `Элемент ${itemIndex + 1}`;

    return rest ? `${label}, поле ${rest}: ${msg}` : `${label}: ${msg}`;
  }

  const [field] = path;
  const label = typeof field === "string" ? (SCENARIO_FIELD_LABELS[field] ?? path.join(".")) : "Сценарий";

  return `${label}: ${msg}`;
}

export function scenarioActionError(error: unknown, itemLabels: string[]): ScenarioActionError {
  const status = errorStatus(error);

  const detail = errorDetail(error);

  if (status === FORBIDDEN) return { kind: "forbidden", message: forbiddenMessage(detail) };
  if (status === CONFLICT) return { kind: "conflict" };

  if (status === VALIDATION && Array.isArray(detail)) {
    return { kind: "validation", issues: detail.filter(isValidationIssue).map((issue) => issueText(issue, itemLabels)) };
  }
  if (typeof detail === "string" && detail.trim()) {
    return status === VALIDATION ? { kind: "validation", issues: [detail] } : { kind: "other", message: detail };
  }

  return { kind: "other", message: "Сервер не выполнил действие. Повторите попытку позже." };
}
