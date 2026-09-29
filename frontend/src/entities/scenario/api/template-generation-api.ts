import {
  api,
  RequestError,
  toCardTemplate,
  toIncomingCallTemplate,
  type CardTemplateDto,
  type IncomingCallTemplateDto,
  type ScenarioTemplate,
  type TemplateGenerationCreateDto,
  type TemplateGenerationDto,
  type TemplateUpdateRequest,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import { cardTemplateMocks, incomingCallTemplateMocks } from "./scenario.mocks";
import { startTemplateGenerationMock, templateGenerationMock } from "./template-generation.mocks";

const NOT_FOUND = 404;
const CONFLICT = 409;
const GENERATIONS_PATH = "card-template-generations";

const endpoints = {
  card: "card-templates",
  call: "incoming-call-templates",
} as const;

const DONE_DECISIONS = new Set(["CONFIRMED", "EDITED"]);

export async function startTemplateGeneration(body: TemplateGenerationCreateDto): Promise<TemplateGenerationDto> {
  if (mocks.scenarios) return startTemplateGenerationMock(body.dds_service_codes, body.created_by);

  const { data } = await api.post<TemplateGenerationDto>(`${CARD_API_URL}/${GENERATIONS_PATH}`, body);

  return data;
}

export async function fetchTemplateGeneration(generationId: string, signal?: AbortSignal): Promise<TemplateGenerationDto> {
  if (mocks.scenarios) {
    const generation = templateGenerationMock(generationId);

    if (!generation) throw new RequestError(NOT_FOUND, "Card template generation not found");

    return generation;
  }

  const { data } = await api.get<TemplateGenerationDto>(`${CARD_API_URL}/${GENERATIONS_PATH}/${generationId}`, { signal });

  return data;
}

function updateMock(request: TemplateUpdateRequest): ScenarioTemplate {
  const list: (CardTemplateDto | IncomingCallTemplateDto)[] =
    request.kind === "call" ? incomingCallTemplateMocks : cardTemplateMocks;
  const index = list.findIndex((item) => item.id === request.templateId && item.is_active);
  const current = list[index];

  if (!current) throw new RequestError(NOT_FOUND, "Active card template not found");
  if (current.status !== "DRAFT") throw new RequestError(CONFLICT, "Only a draft card template can be edited");

  const { review_decisions: decisions, status, name, description, difficulty, expected_result: expectedResult } = request.body;
  const reviewState = { ...current.ai_review_state, ...decisions };
  const sections = Object.keys(current.ai_review_state ?? {});

  if (status === "PUBLISHED" && !sections.every((section) => DONE_DECISIONS.has(reviewState[section] ?? ""))) {
    throw new RequestError(CONFLICT, "Every AI-generated template section must be confirmed or edited before publication");
  }

  const next = {
    ...current,
    name: name ?? current.name,
    description: description === undefined ? current.description : description,
    difficulty: difficulty ?? current.difficulty,
    expected_result: expectedResult ?? current.expected_result,
    ai_review_state: reviewState,
    status: status ?? current.status,
  };

  if ("initial_call" in next) {
    const call = request.kind === "call" && request.body.initial_call ? { ...next, initial_call: request.body.initial_call } : next;

    list[index] = call;
    return toIncomingCallTemplate(call);
  }

  const card = request.kind === "card" && request.body.initial_card ? { ...next, initial_card: request.body.initial_card } : next;

  list[index] = card;
  return toCardTemplate(card);
}

export async function updateTemplate(request: TemplateUpdateRequest): Promise<ScenarioTemplate> {
  if (mocks.scenarios) return updateMock(request);

  if (request.kind === "call") {
    const { data } = await api.patch<IncomingCallTemplateDto>(
      `${CARD_API_URL}/${endpoints.call}/${request.templateId}`,
      request.body,
    );

    return toIncomingCallTemplate(data);
  }

  const { data } = await api.patch<CardTemplateDto>(`${CARD_API_URL}/${endpoints.card}/${request.templateId}`, request.body);

  return toCardTemplate(data);
}
