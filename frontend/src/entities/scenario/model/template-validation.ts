import type { FormIssue } from "@/shared/lib";
import type { ScenarioSourceType, TemplateVariant } from "@/shared/api";
import { formatAddress } from "./address.ts";
import {
  fieldValue,
  isDispatcherVariant,
  optionalCardFields,
  type CardFieldsDraft,
  type ExpectedDraft,
  type OptionalCardField,
  type TemplateDraft,
} from "./expected-draft.ts";
import { ambulanceStatusHint, invalidTransitionIndex, isStatusAllowedFor, requiresComment } from "./response-status.ts";

export const MAX_NAME_LENGTH = 255;
export const MAX_PHONE_LENGTH = 64;
export const MAX_UNIT_LENGTH = 64;
export const MAX_TEXT_LENGTH = 10_000;

export type DraftIssue = FormIssue;

export interface ValidationContext {
  recordExists: (recordId: number) => boolean;
  activeServices: Set<string> | null;
}

export const fieldPaths: Record<OptionalCardField, string> = {
  questionnaire: "fields.questions",
  applicant_full_name: "fields.applicantFullName",
  automatic_phone_number: "fields.automaticPhoneNumber",
  provided_phone_number: "fields.providedPhoneNumber",
  location_phone_number: "fields.locationPhoneNumber",
  reported_address: "fields.reportedAddress.street",
  incident_address: "fields.incidentAddress.street",
  victims_count: "fields.victimsCount",
};

const fieldLabels: Record<OptionalCardField, string> = {
  questionnaire: "Опросная карта",
  applicant_full_name: "ФИО заявителя",
  automatic_phone_number: "АОН",
  provided_phone_number: "Предоставленный телефон",
  location_phone_number: "Телефон на месте",
  reported_address: "Адрес со слов заявителя",
  incident_address: "Адрес происшествия",
  victims_count: "Пострадавших",
};

const unreachableInWorkspace: Partial<Record<OptionalCardField, string>> = {
  reported_address: "АРМ обучаемого не заполняет адрес со слов заявителя: при проверке будет расхождение всегда.",
  victims_count: "АРМ обучаемого не заполняет число пострадавших: при проверке будет расхождение всегда.",
};

function error(path: string, message: string): DraftIssue {
  return { path, message, severity: "error" };
}

function warning(path: string, message: string): DraftIssue {
  return { path, message, severity: "warning" };
}

function lengthIssues(fields: CardFieldsDraft, prefix: string): DraftIssue[] {
  const phones: [keyof CardFieldsDraft, string][] = [
    ["automaticPhoneNumber", "АОН"],
    ["providedPhoneNumber", "Предоставленный телефон"],
    ["locationPhoneNumber", "Телефон на месте"],
  ];

  return [
    ...(fields.applicantFullName.trim().length > MAX_NAME_LENGTH
      ? [error(`${prefix}.applicantFullName`, `ФИО заявителя — не больше ${MAX_NAME_LENGTH} символов.`)]
      : []),
    ...phones.flatMap(([key, label]) => {
      const value = fields[key];

      return typeof value === "string" && value.trim().length > MAX_PHONE_LENGTH
        ? [error(`${prefix}.${key}`, `${label} — не больше ${MAX_PHONE_LENGTH} символов.`)]
        : [];
    }),
    ...(fields.victimsCount !== "" && (!Number.isInteger(fields.victimsCount) || fields.victimsCount < 0)
      ? [error(`${prefix}.victimsCount`, "Число пострадавших — целое, не меньше нуля.")]
      : []),
  ];
}

function addressWithoutPlace(fields: CardFieldsDraft, field: OptionalCardField): boolean {
  if (field !== "incident_address" && field !== "reported_address") return false;

  const address = field === "incident_address" ? fields.incidentAddress : fields.reportedAddress;

  return formatAddress({ ...address, subject: "" }) === "";
}

function modeIssues(draft: ExpectedDraft, source: ScenarioSourceType, prefix: string): DraftIssue[] {
  return optionalCardFields.flatMap((field) => {
    const mode = draft.modes[field];
    const path = `${prefix}.${fieldPaths[field]}`;

    if (mode === "not_checked" && source === "TEMPLATE") {
      return [
        error(path, `${fieldLabels[field]}: в шаблоне поле нельзя исключить из проверки — пустое означает «должно быть пустым».`),
      ];
    }
    if (mode === "must_be_empty" && source === "INLINE") {
      return [
        error(path, `${fieldLabels[field]}: во встроенной карточке «должно быть пустым» задать нельзя — пустое поле не проверяется.`),
      ];
    }
    if (mode !== "checked") return [];
    if (fieldValue(draft.fields, field) === null || addressWithoutPlace(draft.fields, field)) {
      return [error(path, `${fieldLabels[field]}: поле проверяется, но значение не задано — заполните его или выберите другой режим.`)];
    }

    const unreachable = unreachableInWorkspace[field];

    return unreachable ? [warning(path, `${fieldLabels[field]}: ${unreachable}`)] : [];
  });
}


function dispatcherIssues(draft: ExpectedDraft, prefix: string): DraftIssue[] {
  const historyIssues = draft.services.flatMap((code) => {
    const steps = draft.history[code] ?? [];
    const path = `${prefix}.history.${code}`;

    if (steps.length === 0) return [error(path, `Для службы ${code} нужна хотя бы одна смена статуса.`)];

    const invalid = invalidTransitionIndex(steps.map((step) => step.status));

    return [
      ...(invalid === null ? [] : [error(`${path}.${invalid}.status`, "Недопустимый переход статуса реагирования.")]),
      ...steps.flatMap((step, index) => [
        ...(isStatusAllowedFor(code, step.status) ? [] : [error(`${path}.${index}.status`, ambulanceStatusHint)]),
        ...(requiresComment(step.status) && step.comment.trim() === ""
          ? [error(`${path}.${index}.comment`, "Для этого статуса комментарий обязателен.")]
          : []),
        ...(step.comment.trim().length > MAX_TEXT_LENGTH
          ? [error(`${path}.${index}.comment`, `Комментарий — не больше ${MAX_TEXT_LENGTH} символов.`)]
          : []),
        ...(step.unitNumber.trim().length > MAX_UNIT_LENGTH
          ? [error(`${path}.${index}.unitNumber`, `Номер подразделения — не больше ${MAX_UNIT_LENGTH} символов.`)]
          : []),
      ]),
    ];
  });
  const outbound = draft.outbound;
  const outboundIssues = outbound.enabled
    ? [
        ...(outbound.expectedText.trim() === ""
          ? [error(`${prefix}.outbound.expectedText`, "Укажите, что диспетчер должен сообщить бригаде.")]
          : []),
        ...(outbound.expectedText.trim().length > MAX_TEXT_LENGTH
          ? [error(`${prefix}.outbound.expectedText`, `Не больше ${MAX_TEXT_LENGTH} символов.`)]
          : []),
        ...(outbound.minimumSimilarity < 0 || outbound.minimumSimilarity > 1
          ? [error(`${prefix}.outbound.minimumSimilarity`, "Порог сходства — от 0 до 1.")]
          : []),
      ]
    : [];

  return [...historyIssues, ...outboundIssues];
}

export function validateExpected(
  draft: ExpectedDraft,
  variant: TemplateVariant,
  source: ScenarioSourceType,
  context: ValidationContext,
  prefix: string,
): DraftIssue[] {
  const recordIssues =
    draft.recordId === null
      ? [error(`${prefix}.recordId`, "Выберите тип происшествия по классификатору.")]
      : context.recordExists(draft.recordId)
        ? []
        : [error(`${prefix}.recordId`, "Записи нет в классификаторе.")];
  const inactive = context.activeServices
    ? draft.services.filter((code) => !context.activeServices?.has(code))
    : [];
  const serviceIssues = [
    ...(inactive.length > 0
      ? [error(`${prefix}.services`, `Службы неизвестны или неактивны: ${inactive.join(", ")}.`)]
      : []),
    ...(draft.services.length === 0 ? [warning(`${prefix}.services`, "В эталоне нет ни одной службы.")] : []),
  ];

  return [
    ...recordIssues,
    ...serviceIssues,
    ...modeIssues(draft, source, prefix),
    ...lengthIssues(draft.fields, `${prefix}.fields`),
    ...(isDispatcherVariant(variant) ? dispatcherIssues(draft, prefix) : []),
  ];
}

export function validateTemplateDraft(draft: TemplateDraft, context: ValidationContext): DraftIssue[] {
  const name = draft.name.trim();
  const nameIssues =
    name === ""
      ? [error("name", "Укажите название шаблона.")]
      : name.length > MAX_NAME_LENGTH
        ? [error("name", `Название — не больше ${MAX_NAME_LENGTH} символов.`)]
        : [];
  const callIssues =
    draft.variant === "call"
      ? [
          ...(draft.initialUtterance.trim() === ""
            ? [error("initialUtterance", "Укажите первую реплику заявителя.")]
            : []),
          ...(draft.initialUtterance.trim().length > MAX_TEXT_LENGTH
            ? [error("initialUtterance", `Не больше ${MAX_TEXT_LENGTH} символов.`)]
            : []),
        ]
      : [];
  const initialIssues =
    draft.variant !== "call" && !draft.card.initialSameAsExpected
      ? [
          ...lengthIssues(draft.card.initial, "card.initial"),
          ...(formatAddress(draft.card.initial.incidentAddress) === ""
            ? [warning("card.initial.incidentAddress.street", "В исходной карточке нет адреса происшествия.")]
            : []),
        ]
      : [];

  return [
    ...nameIssues,
    ...callIssues,
    ...initialIssues,
    ...validateExpected(draft.expected, draft.variant, "TEMPLATE", context, "expected"),
  ];
}

export function hasErrors(issues: DraftIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
