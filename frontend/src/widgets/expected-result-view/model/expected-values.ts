import { cardStatusLabel, formatJsonValue, responseStatusLabel } from "@/entities/expert-review";
import { classifierRecords, routingFlags } from "@/entities/incident";
import type { JsonObject, JsonValue } from "@/shared/api";
import { serviceWithCode } from "@/shared/config";

const flagLabels = new Map<string, string>(routingFlags);

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function classificationLines(value: JsonObject): string[] {
  const recordId = value.record_id;
  const record = classifierRecords.find((candidate) => candidate.id === recordId);
  const flags = isObject(value.routing_flags)
    ? Object.entries(value.routing_flags)
        .filter(([, selected]) => selected === true)
        .map(([key]) => flagLabels.get(key) ?? key)
    : [];
  const flagLine = flags.length > 0 ? [`Признаки маршрутизации: ${flags.join(", ")}`] : [];

  if (!record) {
    return [
      text(value.final_incident_type) ?? "—",
      `Запись классификатора ${formatJsonValue(recordId ?? null)} не найдена в справочнике`,
      ...flagLine,
    ];
  }

  const chain = [record.group, ...record.features].filter((part): part is string => part !== null).join(" › ");

  return [record.name, chain, ...flagLine];
}

const DEFAULT_MINIMUM_SIMILARITY = 0.8;

export function serviceName(code: string, serviceNames: Map<string, string>): string {
  return serviceWithCode(code, serviceNames.get(code) ?? null);
}

export function expectedValueLines(
  field: string,
  value: JsonValue | undefined,
  serviceNames: Map<string, string>,
): string[] {
  if (value === undefined || value === null) return ["—"];

  if (field === "classification" && isObject(value)) return classificationLines(value);

  if (field === "questionnaire" && isObject(value)) {
    return [`Вопросы: ${text(value.questions) ?? "—"}`, `Ответы: ${text(value.answers) ?? "—"}`];
  }

  if (field === "current_status" && typeof value === "string") return [cardStatusLabel(value)];

  if (field === "services" && Array.isArray(value)) {
    const names = value.flatMap((code) => (typeof code === "string" ? [serviceName(code, serviceNames)] : []));

    return names.length > 0 ? [names.join(", ")] : ["без служб"];
  }

  if (field === "service_statuses" && isObject(value)) {
    const lines = Object.entries(value).map(
      ([code, status]) => `${serviceName(code, serviceNames)} — ${typeof status === "string" ? responseStatusLabel(status) : "—"}`,
    );

    return lines.length > 0 ? lines : ["—"];
  }

  return [formatJsonValue(value)];
}

export interface StatusStep {
  status: string;
  comment: string | null;
  unitNumber: string | null;
}

export function statusHistory(value: JsonValue | undefined): [string, StatusStep[]][] {
  if (!isObject(value)) return [];

  return Object.entries(value).map(([code, steps]) => [
    code,
    Array.isArray(steps)
      ? steps.flatMap((step) =>
          isObject(step) && typeof step.status === "string"
            ? [{ status: responseStatusLabel(step.status), comment: text(step.comment), unitNumber: text(step.unit_number) }]
            : [],
        )
      : [],
  ]);
}

export interface OutboundCallRule {
  expectedText: string;
  minimumSimilarity: number;
}

export function outboundCallRule(value: JsonValue | undefined): OutboundCallRule | null {
  if (!isObject(value)) return null;

  const expectedText = text(value.expected_text);

  if (expectedText === null) return null;

  return {
    expectedText,
    minimumSimilarity:
      typeof value.minimum_similarity === "number" ? value.minimum_similarity : DEFAULT_MINIMUM_SIMILARITY,
  };
}

export function expectedCardOf(expectedResult: JsonObject | null, fallback: JsonObject | null): JsonObject | null {
  const card = expectedResult?.card;

  return isObject(card) ? card : fallback;
}
