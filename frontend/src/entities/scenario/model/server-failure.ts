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

const AMBULANCE_RULE = /^(.*)\.expected_result: service 103 cannot use REJECTED or WORK_REFUSED/;
const TEMPLATE_LOCATION = /^(procedural )?template /;
const SCENARIO_ITEM_LOCATION = /^scenario item (.+)$/;
const UNPUBLISHED_TEMPLATE = /^Inactive or missing (card|incoming call) template/;
const REVIEW_INCOMPLETE = /^Every AI-generated template section must be confirmed or edited/;
const SET_INCOMPLETE = /^Generated template set is incomplete/;
const SHARED_FIELDS = /^Generated 112 and DDS templates differ in shared fields: (.+)$/;
const NOT_DRAFT = /^Only a draft (card|incoming call) template can be edited/;

const sharedFieldLabels: Record<string, string> = {
  classification: "классификация",
  description: "описание",
  questionnaire: "опросная карта",
  applicant_full_name: "ФИО заявителя",
  automatic_phone_number: "АОН",
  provided_phone_number: "телефон заявителя",
  location_phone_number: "телефон на месте",
  reported_address: "адрес со слов заявителя",
  incident_address: "адрес происшествия",
  victims_count: "пострадавшие",
};

const ambulanceRule =
  "служба 103 не ставит «Не принята» и «Отказ от выполнения работ». Замените на «Работы завершены» с комментарием, что бригада не потребовалась.";

export function knownServerMessage(message: string): string | null {
  const ambulance = AMBULANCE_RULE.exec(message);

  if (ambulance) {
    const location = ambulance[1] ?? "";
    const item = SCENARIO_ITEM_LOCATION.exec(location);

    if (TEMPLATE_LOCATION.test(location)) {
      return `Шаблон в составе сценария нарушает правило: ${ambulanceRule} Создайте новую версию шаблона без этих статусов и переведите сценарий на неё.`;
    }

    return item ? `Элемент ${item[1]}: ${ambulanceRule}` : `Эталон: ${ambulanceRule}`;
  }

  if (REVIEW_INCOMPLETE.test(message)) return "Опубликовать нельзя: проверены не все секции черновика.";
  if (SET_INCOMPLETE.test(message)) {
    return "Набор генерации неполный: нет шаблона звонка 112 или карточек ДДС. Запустите генерацию заново.";
  }
  if (NOT_DRAFT.test(message)) return "Шаблон уже опубликован или в архиве — черновиком его больше не править.";

  const shared = SHARED_FIELDS.exec(message);

  if (shared) {
    const fields = (shared[1] ?? "").split(", ").map((field) => sharedFieldLabels[field] ?? field);

    return `Звонок 112 и карточки ДДС из одной генерации должны совпадать в общих полях: ${fields.join(", ")}. Исправьте черновики, чтобы значения совпали, и опубликуйте снова.`;
  }

  if (UNPUBLISHED_TEMPLATE.test(message)) {
    return "Шаблон в составе сценария деактивирован или ещё не опубликован (черновик ИИ). Опубликуйте шаблон или выберите другую версию.";
  }

  return null;
}

export function forbiddenMessage(detail: unknown): string {
  return typeof detail === "string" && /template/i.test(detail)
    ? "Это может сделать только автор шаблона."
    : "Это может сделать только автор сценария.";
}

export function failureOf(status: number | undefined, detail: unknown, mapLoc: LocMapper): ServerFailure {
  const message = typeof detail === "string" && detail.trim() !== "" ? detail : null;

  if (status === FORBIDDEN) return { kind: "forbidden", message: forbiddenMessage(detail) };
  if (status === CONFLICT) {
    return { kind: "conflict", message: (message && knownServerMessage(message)) ?? message ?? "Данные изменились на сервере." };
  }
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
    return {
      kind: "validation",
      issues: [{ path: "", message: knownServerMessage(message) ?? `Сервер: ${message}`, severity: "error" }],
    };
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
