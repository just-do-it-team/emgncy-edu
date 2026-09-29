import type { EmergencyService, JsonValue } from "@/shared/api";

const cardFieldLabels: Record<string, string> = {
  card_number: "номер карточки",
  event_type_id: "тип происшествия",
  classification: "классификация",
  description: "описание",
  questionnaire: "опросная карта",
  applicant_full_name: "ФИО заявителя",
  automatic_phone_number: "АОН",
  provided_phone_number: "предоставленный телефон",
  location_phone_number: "телефон на место",
  reported_address: "адрес со слов заявителя",
  incident_address: "адрес происшествия",
  victims_count: "пострадавших",
  current_status: "статус карточки",
};

const classificationLabels: Record<string, string> = {
  record_id: "Тип происшествия",
  group_code: "Группа происшествий",
  feature_1_code: "Признак 1 порядка",
  feature_2_code: "Признак 2 порядка",
  feature_3_code: "Признак 3 порядка",
  final_incident_type: "Тип происшествия",
  excluded_service_codes: "Исключённые службы",
  routing_flags: "Флаги оповещения",
};

const objectFieldLabels: Record<string, string> = {
  ...cardFieldLabels,
  status: "статус",
  comment: "комментарий",
  unit_number: "бригада",
  final_incident_type: "тип происшествия",
  expected_text: "эталон",
  actual_text: "сказано",
  explanation: "пояснение",
};

// Служебные поля сервера: идентификаторы, модель, счётчики и отметки времени. В интерфейс не выводятся.
const TECHNICAL_KEY = /^(id|key|model|attempts|sequence_no|revision)$|_id$|_at$|^workspace/;

const cardStatusLabels: Record<string, string> = {
  REGISTERED: "Зарегистрирована",
  PROCESSED: "Отработана",
  CHECKED: "Проверена",
  NOT_NOTIFIED: "Не оповещено",
  REFUSAL: "Отказ",
  NOT_COMPLETED: "Не завершено",
  COMPLETED: "Завершена",
};

const handlingValueLabels: Record<string, string> = {
  OPENED: "раскрыта",
  ON_TIME: "в срок",
  MISSED: "просрочено",
  ACCEPTED_OR_REJECTED: "принята или отклонена",
  ACCEPTED: "Принята",
  REJECTED: "Не принята",
};

export const reasonLabels: Record<string, string> = {
  semantic_similarity_below_threshold: "сходство с эталоном ниже порога",
  semantic_evaluation_failed: "оценка моделью не выполнена",
  semantic_evaluation_missing: "оценка моделью не запрашивалась",
  card_not_opened: "карточка не раскрыта",
  card_open_deadline_missed: "раскрытие позже срока",
  card_decision_missing: "решение не принято",
  card_decision_deadline_missed: "решение позже срока",
  required_action_missing: "обязательное действие не выполнено",
};

const responseStatuses = new Map<string, string>([
  ["ADDED", "Добавлена"],
  ["NOT_NOTIFIED", "Не оповещено"],
  ["RECEIVED", "Получена службой"],
  ["ACCEPTED", "Принята"],
  ["REJECTED", "Не принята"],
  ["RESPONSE_STARTED", "Начало реагирования"],
  ["ARRIVED", "Прибытие"],
  ["WORK_IN_PROGRESS", "Проведение работ"],
  ["WORK_COMPLETED", "Работы завершены"],
  ["WORK_REFUSED", "Отказ от выполнения работ"],
]);

export function responseStatusLabel(code: string): string {
  return responseStatuses.get(code) ?? code;
}

export function cardStatusLabel(code: string): string {
  return cardStatusLabels[code] ?? code;
}

export function cardFieldLabel(field: string): string {
  return cardFieldLabels[field] ?? field;
}

function codeAndName(code: string, name: string): string {
  return name.includes(code) ? name : `${code} · ${name}`;
}

export function serviceLabel(
  serviceId: string | null,
  services: Map<string, EmergencyService> | undefined,
): string {
  if (serviceId === null) return "служба не указана";

  const service = services?.get(serviceId);

  return service ? codeAndName(service.code, service.name) : "служба не найдена в справочнике";
}

function serviceByCode(code: string, services: Map<string, EmergencyService> | undefined): string {
  const service = [...(services?.values() ?? [])].find((item) => item.code === code);

  return service ? codeAndName(code, service.name) : `служба ${code}`;
}

function formatNumber(value: number): string {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

/**
 * Объект из ответа сервера в одну строку для человека. Известные формы (доклад, проверенный моделью,
 * запись истории статусов, классификация) форматируются по смыслу; у остальных остаются только поля
 * с подписью, служебные ключи отбрасываются.
 */
function formatObject(value: Record<string, JsonValue>): string {
  const similarity = value.similarity;
  const threshold = value.minimum_similarity;

  if (typeof similarity === "number") {
    return typeof threshold === "number"
      ? `сходство ${formatNumber(similarity)} при пороге ${formatNumber(threshold)}`
      : `сходство ${formatNumber(similarity)}`;
  }
  if (typeof threshold === "number") return `сходство не ниже ${formatNumber(threshold)}`;
  if (typeof value.final_incident_type === "string") return value.final_incident_type;
  if (typeof value.status === "string") {
    const comment = typeof value.comment === "string" && value.comment.trim() !== "" ? ` — ${value.comment}` : "";

    return `${responseStatusLabel(value.status)}${comment}`;
  }

  const parts = Object.entries(value).flatMap(([key, item]) => {
    const label = objectFieldLabels[key];

    if (label === undefined || TECHNICAL_KEY.test(key) || (typeof item === "object" && item !== null)) return [];

    return [`${label}: ${formatJsonValue(item)}`];
  });

  return parts.length === 0 ? "—" : parts.join("; ");
}

export function formatJsonValue(value: JsonValue): string {
  if (value === null) return "—";
  if (typeof value === "string") return value.trim() === "" ? "—" : value;
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (Array.isArray(value)) {
    return value.length === 0 ? "—" : value.map((item) => formatJsonValue(item)).join(", ");
  }

  return formatObject(value);
}

export function discrepancyValue(path: string, value: JsonValue): string {
  if (typeof value !== "string") return formatJsonValue(value);
  if (path === "card.current_status") return cardStatusLabel(value);
  if (path.startsWith("card.service_statuses.") || /\.\d+\.status$/.test(path)) {
    return responseStatusLabel(value);
  }
  if (path.startsWith("service_handling.")) return handlingValueLabels[value] ?? value;

  return formatJsonValue(value);
}

export function discrepancyLabel(
  path: string,
  services: Map<string, EmergencyService> | undefined,
): string {
  const segments = path.split(".");
  const [root, second, third, fourth] = segments;

  if (path === "expected_result.outbound_call") return "Доклад руководителю бригады (проверка моделью)";

  if (root === "card" && second === "classification") {
    if (third === undefined) return "Классификация";
    if (third === "routing_flags") return "Флаг оповещения";

    return classificationLabels[third] ?? "Классификация";
  }
  if (root === "card" && second === "questionnaire") {
    if (third === "questions") return "Опросная карта: вопросы";
    if (third === "answers") return "Опросная карта: ответы";

    return "Опросная карта";
  }
  if (root === "card" && second === "services") return "Службы карточки";
  if (root === "card" && second === "service_statuses" && third !== undefined) {
    return `Статус службы ${serviceByCode(third, services)}`;
  }
  if (root === "card" && second !== undefined) {
    const label = cardFieldLabel(second);

    return label.charAt(0).toLocaleUpperCase("ru") + label.slice(1);
  }
  if (root === "service_status_history" && second !== undefined) {
    const service = serviceByCode(second, services);

    if (third === "length") return `История статусов ${service}: число записей`;
    if (fourth === "status") return `История статусов ${service}: запись ${Number(third) + 1}, статус`;
    if (fourth === "comment") {
      return `История статусов ${service}: запись ${Number(third) + 1}, комментарий`;
    }
  }
  if (root === "service_handling" && second !== undefined) {
    const service = serviceByCode(second, services);
    const labels: Record<string, string> = {
      opened_at: "раскрытие карточки",
      open_deadline: "срок раскрытия",
      decision: "решение по карточке",
      decision_deadline: "срок решения",
    };

    return `${service}: ${labels[third ?? ""] ?? "обработка карточки"}`;
  }

  return "Поле карточки";
}
