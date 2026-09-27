import {
  api,
  RequestError,
  toCardTemplate,
  toIncomingCallTemplate,
  type CardTemplateDto,
  type IncomingCallTemplateDto,
  type ScenarioTemplate,
  type ScenarioTemplateKind,
  type TemplateCreateRequest,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { cardTemplateMocks, incomingCallTemplateMocks, scenarioDetailMocks } from "./scenario.mocks";

const NOT_FOUND = 404;
const CONFLICT = 409;

const endpoints: Record<ScenarioTemplateKind, string> = {
  card: "card-templates",
  call: "incoming-call-templates",
};

export interface TemplateDeactivateRequest {
  kind: ScenarioTemplateKind;
  templateId: string;
  userId: string;
}

function mockTemplates(): ScenarioTemplate[] {
  return [...cardTemplateMocks.map(toCardTemplate), ...incomingCallTemplateMocks.map(toIncomingCallTemplate)];
}

function assertNewMockVersion(templateKey: string | null, version: number) {
  const taken = mockTemplates().some((item) => item.templateKey === templateKey && item.version === version);

  if (taken) throw new RequestError(CONFLICT, "This template version already exists");
}

export async function fetchTemplates(signal?: AbortSignal): Promise<ScenarioTemplate[]> {
  if (mocks.scenarios) return mockTemplates();

  const params = { active_only: false };
  const [cards, calls] = await Promise.all([
    api.get<CardTemplateDto[]>(`${CARD_API_URL}/${endpoints.card}`, { params, signal }),
    api.get<IncomingCallTemplateDto[]>(`${CARD_API_URL}/${endpoints.call}`, { params, signal }),
  ]);

  return [...cards.data.map(toCardTemplate), ...calls.data.map(toIncomingCallTemplate)];
}

export async function fetchScenarioTemplate(
  kind: ScenarioTemplateKind,
  templateId: string,
  signal?: AbortSignal,
): Promise<ScenarioTemplate> {
  if (mocks.scenarios) {
    const found = mockTemplates().find((item) => item.kind === kind && item.id === templateId);

    if (!found) throw new RequestError(NOT_FOUND, "Шаблон не найден");

    return found;
  }

  if (kind === "call") {
    const { data } = await api.get<IncomingCallTemplateDto>(`${CARD_API_URL}/${endpoints.call}/${templateId}`, {
      signal,
    });

    return toIncomingCallTemplate(data);
  }

  const { data } = await api.get<CardTemplateDto>(`${CARD_API_URL}/${endpoints.card}/${templateId}`, { signal });

  return toCardTemplate(data);
}

export async function createTemplate(request: TemplateCreateRequest): Promise<ScenarioTemplate> {
  if (mocks.scenarios) {
    assertNewMockVersion(request.body.template_key, request.body.version);

    const base = {
      id: crypto.randomUUID(),
      template_key: request.body.template_key ?? crypto.randomUUID(),
      version: request.body.version,
      name: request.body.name,
      description: request.body.description,
      difficulty: request.body.difficulty,
      expected_result: request.body.expected_result,
      is_active: true,
      created_by: request.body.created_by,
      created_at: new Date().toISOString(),
    };

    if (request.kind === "call") {
      const created: IncomingCallTemplateDto = { ...base, initial_call: request.body.initial_call };

      incomingCallTemplateMocks.push(created);
      return toIncomingCallTemplate(created);
    }

    const created: CardTemplateDto = { ...base, initial_card: request.body.initial_card };

    cardTemplateMocks.push(created);
    return toCardTemplate(created);
  }

  if (request.kind === "call") {
    const { data } = await api.post<IncomingCallTemplateDto>(`${CARD_API_URL}/${endpoints.call}`, request.body);

    return toIncomingCallTemplate(data);
  }

  const { data } = await api.post<CardTemplateDto>(`${CARD_API_URL}/${endpoints.card}`, request.body);

  return toCardTemplate(data);
}

export async function deactivateTemplate({ kind, templateId, userId }: TemplateDeactivateRequest): Promise<void> {
  if (mocks.scenarios) {
    const used = scenarioDetailMocks.some(
      (scenario) =>
        scenario.status !== "ARCHIVED" &&
        (scenario.definition.cards.some((card) => card.template_id === templateId) ||
          (scenario.definition.procedural_generation?.template_pool.template_ids ?? []).includes(templateId)),
    );

    if (used) throw new RequestError(CONFLICT, "Template is referenced by an active training scenario");

    const list: { id: string; is_active: boolean }[] = kind === "call" ? incomingCallTemplateMocks : cardTemplateMocks;
    const found = list.find((item) => item.id === templateId);

    if (!found) throw new RequestError(NOT_FOUND, "Шаблон не найден");

    found.is_active = false;
    return;
  }

  await api.delete(`${CARD_API_URL}/${endpoints[kind]}/${templateId}`, { data: { deleted_by: userId } });
}
