import type {
  CardTemplateDto,
  DispatcherServiceCode,
  IncomingCallTemplateDto,
  JsonObject,
  TemplateGenerationDto,
} from "@/shared/api";
import { cardTemplateMocks, incomingCallTemplateMocks } from "./scenario.mocks";

const PENDING_MS = 1000;
const PROCESSING_MS = 5000;

const callSections = ["classification", "incident_details", "contacts", "routing"];
const cardSections = ["classification", "incident_details", "routing", "response_statuses", "outbound_call"];

const proposed = (sections: string[]) => Object.fromEntries(sections.map((section) => [section, "AI_PROPOSED"]));

interface MockGeneration {
  dto: TemplateGenerationDto;
  startedAt: number;
}

const generations = new Map<string, MockGeneration>();

function withServices(expected: JsonObject, code: DispatcherServiceCode): JsonObject {
  const card = typeof expected.card === "object" && expected.card !== null && !Array.isArray(expected.card) ? expected.card : {};
  const history = expected.service_status_history;
  const steps =
    typeof history === "object" && history !== null && !Array.isArray(history) ? Object.values(history)[0] : undefined;

  return {
    ...expected,
    card: { ...card, services: [code] },
    service_status_history: { [code]: steps ?? [] },
  };
}

function materialize(generation: TemplateGenerationDto): TemplateGenerationDto {
  if (generation.incoming_call_template_id !== null) return generation;

  const [callSource] = incomingCallTemplateMocks;
  const cardSource = cardTemplateMocks.find((template) => template.expected_result.service_status_history) ?? cardTemplateMocks[0];

  if (!callSource || !cardSource) return { ...generation, status: "FAILED", last_error: "В моке нет исходных шаблонов" };

  const now = new Date().toISOString();
  const common = {
    version: 1,
    difficulty: 2,
    status: "DRAFT" as const,
    generated_by_ai: true,
    generation_id: generation.id,
    is_active: true,
    created_by: generation.created_by,
    created_by_name: null,
    created_at: now,
  };
  const call: IncomingCallTemplateDto = {
    ...callSource,
    ...common,
    id: crypto.randomUUID(),
    template_key: crypto.randomUUID(),
    name: `ИИ: ${callSource.name}`,
    description: "Сгенерировано ИИ, требует проверки преподавателем.",
    ai_review_state: proposed(callSections),
  };
  const cards: CardTemplateDto[] = generation.dds_service_codes.map((code) => ({
    ...cardSource,
    ...common,
    id: crypto.randomUUID(),
    template_key: crypto.randomUUID(),
    name: `ИИ: ${cardSource.name} — ДДС ${code}`,
    description: "Сгенерировано ИИ, требует проверки преподавателем.",
    expected_result: withServices(cardSource.expected_result, code),
    ai_review_state: proposed(cardSections),
  }));

  incomingCallTemplateMocks.push(call);
  cardTemplateMocks.push(...cards);

  return {
    ...generation,
    status: "COMPLETED",
    attempts: 1,
    incoming_call_template_id: call.id,
    card_template_ids: cards.map((card) => card.id),
    completed_at: now,
  };
}

export function startTemplateGenerationMock(codes: DispatcherServiceCode[], userId: string): TemplateGenerationDto {
  const dto: TemplateGenerationDto = {
    id: crypto.randomUUID(),
    dds_service_codes: codes,
    status: "PENDING",
    attempts: 0,
    last_error: null,
    incoming_call_template_id: null,
    card_template_ids: [],
    created_by: userId,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
  };

  generations.set(dto.id, { dto, startedAt: Date.now() });

  return dto;
}

export function templateGenerationMock(generationId: string): TemplateGenerationDto | null {
  const generation = generations.get(generationId);

  if (!generation) return null;

  const elapsed = Date.now() - generation.startedAt;

  if (elapsed < PENDING_MS) return generation.dto;
  if (elapsed < PROCESSING_MS) {
    return { ...generation.dto, status: "PROCESSING", started_at: new Date(generation.startedAt + PENDING_MS).toISOString() };
  }

  const completed = materialize(generation.dto);

  generations.set(generationId, { ...generation, dto: completed });

  return completed;
}
