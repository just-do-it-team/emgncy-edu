import type { JsonObject, JsonValue } from "./json";

export type ScenarioTemplateKind = "card" | "call";

export type TemplateVariant = "card112" | "cardDds" | "call";

export type TemplateStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type TemplateReviewDecision = "CONFIRMED" | "EDITED" | "REJECTED";

export interface CardTemplateDto {
  id: string;
  template_key: string;
  version: number;
  name: string;
  description: string | null;
  difficulty: number;
  initial_card: JsonObject;
  expected_result: JsonObject;
  status: TemplateStatus;
  generated_by_ai: boolean;
  ai_review_state: Record<string, string> | null;
  generation_id: string | null;
  is_active: boolean;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
}

export interface IncomingCallTemplateDto extends Omit<CardTemplateDto, "initial_card"> {
  initial_call: JsonObject;
}

interface TemplateCreateBase {
  template_key: string | null;
  version: number;
  name: string;
  description: string | null;
  difficulty: number;
  expected_result: JsonObject;
  created_by: string;
}

export interface CardTemplateCreateDto extends TemplateCreateBase {
  initial_card: JsonObject;
}

export interface IncomingCallTemplateCreateDto extends TemplateCreateBase {
  initial_call: { initial_utterance: string; automatic_phone_number: string | null };
}

export type TemplateCreateRequest =
  | { kind: "card"; body: CardTemplateCreateDto }
  | { kind: "call"; body: IncomingCallTemplateCreateDto };

export interface ScenarioTemplate {
  id: string;
  templateKey: string;
  kind: ScenarioTemplateKind;
  variant: TemplateVariant;
  version: number;
  name: string;
  description: string | null;
  difficulty: number;
  status: TemplateStatus;
  generatedByAi: boolean;
  aiReviewState: Record<string, string> | null;
  generationId: string | null;
  isActive: boolean;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  initialCard: JsonObject | null;
  initialCall: JsonObject | null;
  expectedResult: JsonObject;
  recordId: number | null;
  services: string[];
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectedCard(expected: JsonObject): JsonObject | null {
  return isObject(expected.card) ? expected.card : null;
}

function recordIdOf(expected: JsonObject): number | null {
  const card = expectedCard(expected);
  const classification = card?.classification;

  return isObject(classification) && typeof classification.record_id === "number" ? classification.record_id : null;
}

function servicesOf(expected: JsonObject): string[] {
  const services = expectedCard(expected)?.services;

  return Array.isArray(services) ? services.filter((code): code is string => typeof code === "string") : [];
}

export function cardVariantOf(expected: JsonObject): TemplateVariant {
  const history = expected.service_status_history;
  const outbound = expected.outbound_call;

  return (history !== undefined && history !== null) || (outbound !== undefined && outbound !== null)
    ? "cardDds"
    : "card112";
}

export function toCardTemplate(dto: CardTemplateDto): ScenarioTemplate {
  return {
    id: dto.id,
    templateKey: dto.template_key,
    kind: "card",
    variant: cardVariantOf(dto.expected_result),
    version: dto.version,
    name: dto.name,
    description: dto.description,
    difficulty: dto.difficulty,
    status: dto.status,
    generatedByAi: dto.generated_by_ai,
    aiReviewState: dto.ai_review_state,
    generationId: dto.generation_id,
    isActive: dto.is_active,
    createdBy: dto.created_by,
    createdByName: dto.created_by_name,
    createdAt: dto.created_at,
    initialCard: dto.initial_card,
    initialCall: null,
    expectedResult: dto.expected_result,
    recordId: recordIdOf(dto.expected_result),
    services: servicesOf(dto.expected_result),
  };
}

export function toIncomingCallTemplate(dto: IncomingCallTemplateDto): ScenarioTemplate {
  return {
    id: dto.id,
    templateKey: dto.template_key,
    kind: "call",
    variant: "call",
    version: dto.version,
    name: dto.name,
    description: dto.description,
    difficulty: dto.difficulty,
    status: dto.status,
    generatedByAi: dto.generated_by_ai,
    aiReviewState: dto.ai_review_state,
    generationId: dto.generation_id,
    isActive: dto.is_active,
    createdBy: dto.created_by,
    createdByName: dto.created_by_name,
    createdAt: dto.created_at,
    initialCard: null,
    initialCall: dto.initial_call,
    expectedResult: dto.expected_result,
    recordId: recordIdOf(dto.expected_result),
    services: servicesOf(dto.expected_result),
  };
}
