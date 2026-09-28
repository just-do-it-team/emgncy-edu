import type {
  JsonObject,
  JsonValue,
  OperatorClassificationDto,
  ScenarioSourceType,
  ScenarioTemplate,
  TemplateCreateRequest,
  TemplateVariant,
} from "@/shared/api";
import { addressFromText, emptyAddress, formatAddress, type AddressDraft } from "./address.ts";
import type { CheckMode } from "./check-mode.ts";
import { isResponseStatus, lastStatus, type ServiceResponseStatus } from "./response-status.ts";

export const cardStatuses = [
  "REGISTERED",
  "PROCESSED",
  "CHECKED",
  "NOT_NOTIFIED",
  "REFUSAL",
  "NOT_COMPLETED",
  "COMPLETED",
] as const;

export type CardStatus = (typeof cardStatuses)[number];

export const cardSourceTypes = ["SMS", "VIS", "ERA_GLONASS", "REGIONAL_112", "CALL", "MANUAL"] as const;

export type CardSourceType = (typeof cardSourceTypes)[number];

export const optionalCardFields = [
  "questionnaire",
  "applicant_full_name",
  "automatic_phone_number",
  "provided_phone_number",
  "location_phone_number",
  "reported_address",
  "incident_address",
  "victims_count",
] as const;

export type OptionalCardField = (typeof optionalCardFields)[number];

export const DEFAULT_MINIMUM_SIMILARITY = 0.8;

export interface CardFieldsDraft {
  description: string;
  applicantFullName: string;
  automaticPhoneNumber: string;
  providedPhoneNumber: string;
  locationPhoneNumber: string;
  reportedAddress: AddressDraft;
  incidentAddress: AddressDraft;
  victimsCount: number | "";
  questions: string;
  answers: string;
}

export interface StatusStepDraft {
  status: ServiceResponseStatus;
  comment: string;
  unitNumber: string;
}

export interface OutboundDraft {
  enabled: boolean;
  expectedText: string;
  minimumSimilarity: number;
}

export interface ExpectedDraft {
  recordId: number | null;
  flags: Record<string, boolean>;
  services: string[];
  currentStatus: CardStatus;
  fields: CardFieldsDraft;
  modes: Record<OptionalCardField, CheckMode>;
  history: Record<string, StatusStepDraft[]>;
  outbound: OutboundDraft;
}

export interface CardSourceDraft {
  sourceType: CardSourceType;
  initialSameAsExpected: boolean;
  initial: CardFieldsDraft;
}

export interface TemplateDraft {
  variant: TemplateVariant;
  name: string;
  description: string;
  difficulty: number;
  initialUtterance: string;
  card: CardSourceDraft;
  expected: ExpectedDraft;
}

export const emptyCardFields: CardFieldsDraft = {
  description: "",
  applicantFullName: "",
  automaticPhoneNumber: "",
  providedPhoneNumber: "",
  locationPhoneNumber: "",
  reportedAddress: emptyAddress,
  incidentAddress: emptyAddress,
  victimsCount: "",
  questions: "",
  answers: "",
};

export function defaultModes(source: ScenarioSourceType): Record<OptionalCardField, CheckMode> {
  const empty: CheckMode = source === "TEMPLATE" ? "must_be_empty" : "not_checked";
  const modes = Object.fromEntries(optionalCardFields.map((field) => [field, empty]));

  return {
    ...(modes as Record<OptionalCardField, CheckMode>),
    automatic_phone_number: "checked",
    incident_address: "checked",
  };
}

export function emptyExpected(source: ScenarioSourceType): ExpectedDraft {
  return {
    recordId: null,
    flags: {},
    services: [],
    currentStatus: "REGISTERED",
    fields: emptyCardFields,
    modes: defaultModes(source),
    history: {},
    outbound: { enabled: false, expectedText: "", minimumSimilarity: DEFAULT_MINIMUM_SIMILARITY },
  };
}

export function emptyTemplateDraft(variant: TemplateVariant): TemplateDraft {
  return {
    variant,
    name: "",
    description: "",
    difficulty: 1,
    initialUtterance: "",
    card: {
      sourceType: variant === "cardDds" ? "CALL" : "SMS",
      initialSameAsExpected: variant === "cardDds",
      initial: emptyCardFields,
    },
    expected: emptyExpected("TEMPLATE"),
  };
}

export function isDispatcherVariant(variant: TemplateVariant): boolean {
  return variant === "cardDds";
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

export function fieldValue(fields: CardFieldsDraft, field: OptionalCardField): JsonValue {
  switch (field) {
    case "questionnaire":
      return fields.questions.trim() === "" && fields.answers.trim() === ""
        ? null
        : { questions: fields.questions.trim(), answers: fields.answers.trim() };
    case "applicant_full_name":
      return trimmedOrNull(fields.applicantFullName);
    case "automatic_phone_number":
      return trimmedOrNull(fields.automaticPhoneNumber);
    case "provided_phone_number":
      return trimmedOrNull(fields.providedPhoneNumber);
    case "location_phone_number":
      return trimmedOrNull(fields.locationPhoneNumber);
    case "reported_address":
      return trimmedOrNull(formatAddress(fields.reportedAddress));
    case "incident_address":
      return trimmedOrNull(formatAddress(fields.incidentAddress));
    case "victims_count":
      return fields.victimsCount === "" ? null : fields.victimsCount;
  }
}

export function serviceStatuses(draft: ExpectedDraft, dispatcher: boolean): Record<string, ServiceResponseStatus> {
  return Object.fromEntries(
    draft.services.map((code) => [
      code,
      dispatcher ? lastStatus((draft.history[code] ?? []).map((step) => step.status)) : "ADDED",
    ]),
  );
}

export function expectedCardBody(
  draft: ExpectedDraft,
  source: ScenarioSourceType,
  dispatcher: boolean,
  classification: OperatorClassificationDto,
): JsonObject {
  const optional = optionalCardFields.flatMap((field): [string, JsonValue][] => {
    const mode = draft.modes[field];

    if (mode === "checked") return [[field, fieldValue(draft.fields, field)]];
    if (mode === "must_be_empty" && source === "TEMPLATE") return [[field, null]];

    return [];
  });

  return {
    classification: { ...classification },
    description: draft.fields.description.trim(),
    ...Object.fromEntries(optional),
    current_status: draft.currentStatus,
    services: [...draft.services],
    service_statuses: serviceStatuses(draft, dispatcher),
  };
}

export function expectedResultBody(
  draft: ExpectedDraft,
  source: ScenarioSourceType,
  dispatcher: boolean,
  classification: OperatorClassificationDto,
): JsonObject {
  const history = dispatcher
    ? Object.fromEntries(
        draft.services.map((code) => [
          code,
          (draft.history[code] ?? []).map((step) => ({
            status: step.status,
            comment: trimmedOrNull(step.comment),
            unit_number: trimmedOrNull(step.unitNumber),
          })),
        ]),
      )
    : null;
  const outbound =
    dispatcher && draft.outbound.enabled
      ? { expected_text: draft.outbound.expectedText.trim(), minimum_similarity: draft.outbound.minimumSimilarity }
      : null;
  const card = expectedCardBody(draft, source, dispatcher, classification);

  if (source === "TEMPLATE") return { card, outbound_call: outbound, service_status_history: history };

  return {
    card,
    ...(history === null ? {} : { service_status_history: history }),
    ...(outbound === null ? {} : { outbound_call: outbound }),
  };
}

export function initialCardBody(
  card: CardSourceDraft,
  expected: ExpectedDraft,
  classification: OperatorClassificationDto,
): JsonObject {
  const fields = card.initialSameAsExpected ? expected.fields : card.initial;

  return {
    source_type: card.sourceType,
    classification: { ...classification },
    description: fields.description.trim(),
    ...Object.fromEntries(optionalCardFields.map((field) => [field, fieldValue(fields, field)])),
  };
}

export interface TemplateBodyContext {
  classification: OperatorClassificationDto;
  userId: string;
  templateKey: string | null;
  version: number;
}

export function templateCreateBody(draft: TemplateDraft, context: TemplateBodyContext): TemplateCreateRequest {
  const dispatcher = isDispatcherVariant(draft.variant);
  const base = {
    template_key: context.templateKey,
    version: context.version,
    name: draft.name.trim(),
    description: trimmedOrNull(draft.description),
    difficulty: draft.difficulty,
    expected_result: expectedResultBody(draft.expected, "TEMPLATE", dispatcher, context.classification),
    created_by: context.userId,
  };

  if (draft.variant === "call") {
    return {
      kind: "call",
      body: {
        ...base,
        initial_call: {
          initial_utterance: draft.initialUtterance.trim(),
          automatic_phone_number: trimmedOrNull(draft.expected.fields.automaticPhoneNumber),
        },
      },
    };
  }

  return {
    kind: "card",
    body: { ...base, initial_card: initialCardBody(draft.card, draft.expected, context.classification) },
  };
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function isCardStatus(value: JsonValue | undefined): value is CardStatus {
  return typeof value === "string" && (cardStatuses as readonly string[]).includes(value);
}

function isSourceType(value: JsonValue | undefined): value is CardSourceType {
  return typeof value === "string" && (cardSourceTypes as readonly string[]).includes(value);
}

export function cardFieldsFromJson(card: JsonObject): CardFieldsDraft {
  const questionnaire = isObject(card.questionnaire) ? card.questionnaire : null;

  return {
    description: text(card.description),
    applicantFullName: text(card.applicant_full_name),
    automaticPhoneNumber: text(card.automatic_phone_number),
    providedPhoneNumber: text(card.provided_phone_number),
    locationPhoneNumber: text(card.location_phone_number),
    reportedAddress: typeof card.reported_address === "string" ? addressFromText(card.reported_address) : emptyAddress,
    incidentAddress: typeof card.incident_address === "string" ? addressFromText(card.incident_address) : emptyAddress,
    victimsCount: typeof card.victims_count === "number" ? card.victims_count : "",
    questions: text(questionnaire?.questions),
    answers: text(questionnaire?.answers),
  };
}

function modesFromJson(card: JsonObject, source: ScenarioSourceType): Record<OptionalCardField, CheckMode> {
  const modes = optionalCardFields.map((field): [OptionalCardField, CheckMode] => {
    if (!(field in card)) return [field, "not_checked"];
    if (card[field] === null) return [field, source === "INLINE" ? "not_checked" : "must_be_empty"];

    return [field, "checked"];
  });

  return Object.fromEntries(modes) as Record<OptionalCardField, CheckMode>;
}

function historyFromJson(value: JsonValue | undefined): Record<string, StatusStepDraft[]> {
  if (!isObject(value)) return {};

  return Object.fromEntries(
    Object.entries(value).map(([code, steps]) => [
      code,
      Array.isArray(steps)
        ? steps.flatMap((step) =>
            isObject(step) && typeof step.status === "string" && isResponseStatus(step.status)
              ? [{ status: step.status, comment: text(step.comment), unitNumber: text(step.unit_number) }]
              : [],
          )
        : [],
    ]),
  );
}

export function expectedFromJson(expected: JsonObject, source: ScenarioSourceType): ExpectedDraft {
  const card = isObject(expected.card) ? expected.card : {};
  const classification = isObject(card.classification) ? card.classification : {};
  const flags = isObject(classification.routing_flags) ? classification.routing_flags : {};
  const outbound = isObject(expected.outbound_call) ? expected.outbound_call : null;

  return {
    recordId: typeof classification.record_id === "number" ? classification.record_id : null,
    flags: Object.fromEntries(Object.entries(flags).filter(([, selected]) => selected === true).map(([key]) => [key, true])),
    services: Array.isArray(card.services) ? card.services.filter((code): code is string => typeof code === "string") : [],
    currentStatus: isCardStatus(card.current_status) ? card.current_status : "REGISTERED",
    fields: cardFieldsFromJson(card),
    modes: modesFromJson(card, source),
    history: historyFromJson(expected.service_status_history),
    outbound: {
      enabled: outbound !== null,
      expectedText: text(outbound?.expected_text),
      minimumSimilarity:
        typeof outbound?.minimum_similarity === "number" ? outbound.minimum_similarity : DEFAULT_MINIMUM_SIMILARITY,
    },
  };
}

export function cardSourceFromJson(initialCard: JsonObject | null, expected: ExpectedDraft): CardSourceDraft {
  const initial = initialCard ? cardFieldsFromJson(initialCard) : emptyCardFields;

  return {
    sourceType: isSourceType(initialCard?.source_type) ? initialCard.source_type : "MANUAL",
    initialSameAsExpected: JSON.stringify(initial) === JSON.stringify(expected.fields),
    initial,
  };
}

export function templateDraftFromTemplate(template: ScenarioTemplate): TemplateDraft {
  const expected = expectedFromJson(template.expectedResult, "TEMPLATE");

  return {
    variant: template.variant,
    name: template.name,
    description: template.description ?? "",
    difficulty: template.difficulty,
    initialUtterance: text(template.initialCall?.initial_utterance),
    card: cardSourceFromJson(template.initialCard, expected),
    expected,
  };
}
