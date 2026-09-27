import {
  api,
  RequestError,
  toCardTemplate,
  toIncomingCallTemplate,
  toScenarioCopy,
  toScenarioDetail,
  toScenarioListItem,
  type CardTemplateDto,
  type IncomingCallTemplateDto,
  type ScenarioDetail,
  type ScenarioListItem,
  type ScenarioTemplate,
  type ScenarioTemplateKind,
  type TrainingScenarioCreateDto,
  type TrainingScenarioDetailDto,
  type TrainingScenarioDto,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { incomingCallTemplateMocks, scenarioDetailMocks } from "./scenario.mocks";

const MAX_NAME_LENGTH = 255;
const COPY_SUFFIX = " (копия)";
const REVISION_CONFLICT = 409;
const NOT_FOUND = 404;

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

export async function fetchScenarioTemplate(
  kind: ScenarioTemplateKind,
  templateId: string,
  signal?: AbortSignal,
): Promise<ScenarioTemplate> {
  if (kind === "call") {
    if (mocks.scenarios) {
      const found = incomingCallTemplateMocks.find((item) => item.id === templateId);

      if (!found) throw new RequestError(NOT_FOUND, "Шаблон звонка не найден");

      return toIncomingCallTemplate(found);
    }

    const { data } = await api.get<IncomingCallTemplateDto>(
      `${CARD_API_URL}/incoming-call-templates/${templateId}`,
      { signal },
    );

    return toIncomingCallTemplate(data);
  }

  if (mocks.scenarios) throw new RequestError(NOT_FOUND, "Шаблон карточки не найден");

  const { data } = await api.get<CardTemplateDto>(`${CARD_API_URL}/card-templates/${templateId}`, {
    signal,
  });

  return toCardTemplate(data);
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
