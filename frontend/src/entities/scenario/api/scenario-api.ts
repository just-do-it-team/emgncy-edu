import {
  api,
  RequestError,
  toScenarioCopy,
  toScenarioDetail,
  toScenarioListItem,
  type ScenarioDetail,
  type ScenarioListItem,
  type JsonObject,
  type JsonValue,
  type ScenarioItemDetailDto,
  type TrainingScenarioCreateDto,
  type TrainingScenarioDetailDto,
  type TrainingScenarioDto,
  type TrainingScenarioUpdateDto,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { cardTemplateMocks, incomingCallTemplateMocks, scenarioDetailMocks } from "./scenario.mocks";

const MAX_NAME_LENGTH = 255;
const COPY_SUFFIX = " (копия)";
const REVISION_CONFLICT = 409;
const NOT_FOUND = 404;
const FORBIDDEN = 403;

export interface ScenarioRevisionRequest {
  scenarioId: string;
  revision: number;
  userId: string;
}

export interface ScenarioCopyRequest {
  scenarioId: string;
  userId: string;
}

function mockScenario(scenarioId: string): TrainingScenarioDetailDto {
  const found = scenarioDetailMocks.find((item) => item.id === scenarioId);

  if (!found) throw new RequestError(NOT_FOUND, "Сценарий не найден");

  return found;
}

function assertMockRevision(scenario: TrainingScenarioDetailDto, revision: number) {
  if (scenario.revision !== revision) {
    throw new RequestError(REVISION_CONFLICT, "Scenario revision conflict");
  }
}

function copyName(name: string): string {
  return `${name.slice(0, MAX_NAME_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
}

export async function fetchScenarios(signal?: AbortSignal): Promise<ScenarioListItem[]> {
  if (mocks.scenarios) return scenarioDetailMocks.map(toScenarioListItem);

  const { data } = await api.get<TrainingScenarioDto[]>(`${CARD_API_URL}/training-scenarios`, {
    params: { include_archived: true },
    signal,
  });

  return data.map(toScenarioListItem);
}

export async function fetchScenario(scenarioId: string, signal?: AbortSignal): Promise<ScenarioDetail> {
  if (mocks.scenarios) return toScenarioDetail(mockScenario(scenarioId));

  const { data } = await api.get<TrainingScenarioDetailDto>(
    `${CARD_API_URL}/training-scenarios/${scenarioId}`,
    { signal },
  );

  return toScenarioDetail(data);
}

export async function publishScenario({ scenarioId, revision, userId }: ScenarioRevisionRequest): Promise<void> {
  if (mocks.scenarios) {
    const scenario = mockScenario(scenarioId);

    assertMockRevision(scenario, revision);
    Object.assign(scenario, {
      status: "PUBLISHED",
      revision: revision + 1,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  await api.patch(`${CARD_API_URL}/training-scenarios/${scenarioId}`, {
    expected_revision: revision,
    updated_by: userId,
    status: "PUBLISHED",
  });
}

export async function unpublishScenario({ scenarioId, revision, userId }: ScenarioRevisionRequest): Promise<void> {
  if (mocks.scenarios) {
    const scenario = mockScenario(scenarioId);

    if (scenario.created_by !== userId) {
      throw new RequestError(FORBIDDEN, "Only the scenario author can modify or archive it");
    }
    assertMockRevision(scenario, revision);
    if (scenario.status !== "PUBLISHED") {
      throw new RequestError(REVISION_CONFLICT, "A published scenario can only be returned to draft status");
    }
    Object.assign(scenario, {
      status: "DRAFT",
      revision: revision + 1,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  await api.patch(`${CARD_API_URL}/training-scenarios/${scenarioId}`, {
    expected_revision: revision,
    updated_by: userId,
    status: "DRAFT",
  });
}

export async function archiveScenario({ scenarioId, revision, userId }: ScenarioRevisionRequest): Promise<void> {
  if (mocks.scenarios) {
    const scenario = mockScenario(scenarioId);

    assertMockRevision(scenario, revision);
    Object.assign(scenario, {
      status: "ARCHIVED",
      revision: revision + 1,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  await api.delete(`${CARD_API_URL}/training-scenarios/${scenarioId}`, {
    data: { deleted_by: userId, expected_revision: revision },
  });
}

export async function copyScenario({ scenarioId, userId }: ScenarioCopyRequest): Promise<string> {
  if (mocks.scenarios) {
    const source = mockScenario(scenarioId);
    const now = new Date().toISOString();
    const copy: TrainingScenarioDetailDto = {
      ...source,
      ...toScenarioCopy(source, copyName(source.name), userId),
      passing_score: source.passing_score,
      id: crypto.randomUUID(),
      revision: 1,
      updated_by: userId,
      created_at: now,
      updated_at: now,
    };

    scenarioDetailMocks.push(copy);
    return copy.id;
  }

  const { data: source } = await api.get<TrainingScenarioDetailDto>(
    `${CARD_API_URL}/training-scenarios/${scenarioId}`,
  );
  const body: TrainingScenarioCreateDto = toScenarioCopy(source, copyName(source.name), userId);
  const { data } = await api.post<TrainingScenarioDto>(`${CARD_API_URL}/training-scenarios`, body);

  return data.id;
}

export interface ScenarioUpdateRequest {
  scenarioId: string;
  body: TrainingScenarioUpdateDto;
}

export interface SavedScenario {
  id: string;
  revision: number;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mockItems(definition: TrainingScenarioCreateDto["definition"]): ScenarioItemDetailDto[] {
  const templates = [...cardTemplateMocks, ...incomingCallTemplateMocks];

  return definition.cards.map((card) => {
    const template = templates.find((item) => item.id === card.template_id);
    const expected = card.expected_result ?? template?.expected_result ?? {};
    const expectedCard = isObject(expected.card) ? expected.card : null;
    const classification = expectedCard && isObject(expectedCard.classification) ? expectedCard.classification : null;
    const services = Array.isArray(expectedCard?.services)
      ? expectedCard.services.filter((code): code is string => typeof code === "string")
      : [];
    const notificationList = services.map((code, index) => ({ service_id: null, code, name: null, is_main: index === 0 }));

    return {
      key: card.key,
      item_type: card.item_type,
      source_type: card.source_type,
      template_id: card.template_id ?? null,
      template_name: template?.name ?? null,
      initial_card: card.initial_card ?? (template && "initial_card" in template ? template.initial_card : null),
      expected_card: expectedCard,
      classification:
        classification && typeof classification.record_id === "number"
          ? {
              record_id: classification.record_id,
              group_code: Number(classification.group_code),
              feature_1_code: Number(classification.feature_1_code),
              feature_2_code: Number(classification.feature_2_code),
              feature_3_code: Number(classification.feature_3_code),
              final_incident_type: String(classification.final_incident_type),
              routing_flags: {},
              excluded_service_codes: [],
            }
          : null,
      main_service: notificationList[0] ?? null,
      notification_list: notificationList,
    };
  });
}

function cardsCount(definition: TrainingScenarioCreateDto["definition"]): number {
  return definition.cards.length + (definition.procedural_generation?.target_count ?? 0);
}

export async function createScenario(body: TrainingScenarioCreateDto): Promise<SavedScenario> {
  if (mocks.scenarios) {
    const now = new Date().toISOString();
    const created: TrainingScenarioDetailDto = {
      ...body,
      passing_score: body.passing_score.toFixed(2),
      id: crypto.randomUUID(),
      cards_count: cardsCount(body.definition),
      revision: 1,
      updated_by: body.created_by,
      created_at: now,
      updated_at: now,
      items: mockItems(body.definition),
    };

    scenarioDetailMocks.push(created);
    return { id: created.id, revision: created.revision };
  }

  const { data } = await api.post<TrainingScenarioDto>(`${CARD_API_URL}/training-scenarios`, body);

  return { id: data.id, revision: data.revision };
}

export async function updateScenario({ scenarioId, body }: ScenarioUpdateRequest): Promise<SavedScenario> {
  if (mocks.scenarios) {
    const scenario = mockScenario(scenarioId);
    const { expected_revision: expectedRevision, updated_by: updatedBy, ...fields } = body;

    if (scenario.created_by !== updatedBy) {
      throw new RequestError(FORBIDDEN, "Only the scenario author can modify or archive it");
    }
    assertMockRevision(scenario, expectedRevision);
    if (scenario.status !== "DRAFT") throw new RequestError(REVISION_CONFLICT, "Only a draft scenario can be edited");

    Object.assign(scenario, {
      ...fields,
      passing_score: fields.passing_score.toFixed(2),
      cards_count: cardsCount(body.definition),
      revision: scenario.revision + 1,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
      items: mockItems(body.definition),
    });
    return { id: scenario.id, revision: scenario.revision };
  }

  const { data } = await api.patch<TrainingScenarioDto>(`${CARD_API_URL}/training-scenarios/${scenarioId}`, body);

  return { id: data.id, revision: data.revision };
}
