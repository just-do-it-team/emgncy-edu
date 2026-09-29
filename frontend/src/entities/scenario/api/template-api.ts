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
import { isTemplateUsable, type TemplateUpgradeBody } from "../model/template-library";
import { cardTemplateMocks, incomingCallTemplateMocks, scenarioDetailMocks } from "./scenario.mocks";

const NOT_FOUND = 404;
const FORBIDDEN = 403;
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
      status: "PUBLISHED" as const,
      generated_by_ai: false,
      ai_review_state: null,
      generation_id: null,
      is_active: true,
      created_by: request.body.created_by,
      created_by_name: null,
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

    const list: { id: string; is_active: boolean; status: string }[] =
      kind === "call" ? incomingCallTemplateMocks : cardTemplateMocks;
    const found = list.find((item) => item.id === templateId);

    if (!found) throw new RequestError(NOT_FOUND, "Шаблон не найден");

    found.is_active = false;
    found.status = "ARCHIVED";
    return;
  }

  await api.delete(`${CARD_API_URL}/${endpoints[kind]}/${templateId}`, { data: { deleted_by: userId } });
}

export interface TemplateUpgradeRequest {
  kind: ScenarioTemplateKind;
  templateId: string;
  body: TemplateUpgradeBody;
}

function mockUpgrade({ templateId, body }: TemplateUpgradeRequest): string[] {
  const templates = mockTemplates();
  const target = templates.find((item) => item.id === templateId);

  if (!target || !isTemplateUsable(target)) throw new RequestError(NOT_FOUND, "Active template not found");

  const sameKey = new Set(
    templates.filter((item) => item.kind === target.kind && item.templateKey === target.templateKey).map((item) => item.id),
  );

  const scenarios = body.scenarios.map(({ scenario_id: scenarioId, expected_revision: revision }) => {
    const scenario = scenarioDetailMocks.find((item) => item.id === scenarioId);

    if (!scenario) throw new RequestError(NOT_FOUND, `Training scenarios not found: ${scenarioId}`);
    if (scenario.created_by !== body.updated_by) {
      throw new RequestError(FORBIDDEN, "Only the scenario author can modify or archive it");
    }
    if (scenario.status !== "DRAFT") throw new RequestError(CONFLICT, `Scenario ${scenarioId} must be returned to DRAFT before upgrade`);
    if (scenario.revision !== revision) throw new RequestError(CONFLICT, `Scenario ${scenarioId} revision conflict`);

    return scenario;
  });

  for (const scenario of scenarios) {
    scenario.definition.cards = scenario.definition.cards.map((card) =>
      card.template_id !== undefined && sameKey.has(card.template_id) ? { ...card, template_id: target.id } : card,
    );
    scenario.revision += 1;
    scenario.updated_by = body.updated_by;
    scenario.updated_at = new Date().toISOString();
  }

  return scenarios.map((scenario) => scenario.id);
}

export async function upgradeTemplateScenarios(request: TemplateUpgradeRequest): Promise<string[]> {
  if (mocks.scenarios) return mockUpgrade(request);

  const { data } = await api.post<{ id: string }[]>(
    `${CARD_API_URL}/${endpoints[request.kind]}/${request.templateId}/upgrade-scenarios`,
    request.body,
  );

  return data.map((scenario) => scenario.id);
}
