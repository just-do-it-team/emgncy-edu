import type { JsonObject } from "./json";

export type ScenarioStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type ScenarioWorkspaceMode = "INDIVIDUAL" | "SHARED";

export type ScenarioItemType = "INCIDENT_CARD" | "INCOMING_CALL";

export type ScenarioMode = "STATIC" | "PROCEDURAL" | "HYBRID";

export type ScenarioCompletionPolicy = "STUDENT_CONFIRM" | "AUTO_WHEN_READY" | "TEACHER_ONLY";

export type ScenarioCardDefinitionDto = {
  key: string;
  item_type: ScenarioItemType;
  source_type: string;
  template_id?: string;
} & (
  | { trigger_type: "TIME_OFFSET"; trigger_config: { offset_seconds: number } }
  | {
      trigger_type: "AFTER_ACTION";
      trigger_config: { card_key: string; action_type: string; delay_seconds: number };
    }
);

export interface ProceduralGenerationDto {
  key: string;
  target_count: number;
  template_pool: {
    template_ids?: string[];
    classification_group_codes?: number[];
  };
}

export interface ScenarioDefinitionDto {
  schema_version: number;
  mode: ScenarioMode;
  cards: ScenarioCardDefinitionDto[];
  procedural_generation?: ProceduralGenerationDto;
}

export interface TrainingScenarioDto {
  id: string;
  name: string;
  description: string | null;
  difficulty: number;
  estimated_duration_seconds: number;
  cards_count: number;
  workspace_mode: ScenarioWorkspaceMode;
  completion_policy: ScenarioCompletionPolicy;
  min_participants: number;
  max_participants: number;
  definition: ScenarioDefinitionDto;
  revision: number;
  status: ScenarioStatus;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScenarioServiceDetailDto {
  service_id: string | null;
  code: string;
  name: string | null;
  is_main: boolean;
}

export interface OperatorClassificationDto {
  record_id: number;
  group_code: number;
  feature_1_code: number;
  feature_2_code: number;
  feature_3_code: number;
  final_incident_type: string;
  routing_flags: Record<string, boolean>;
  excluded_service_codes: string[];
}

export interface ScenarioItemDetailDto {
  key: string;
  item_type: ScenarioItemType;
  source_type: string;
  template_id: string | null;
  template_name: string | null;
  initial_card: JsonObject | null;
  initial_call: JsonObject | null;
  expected_card: JsonObject | null;
  classification: OperatorClassificationDto | null;
  main_service: ScenarioServiceDetailDto | null;
  notification_list: ScenarioServiceDetailDto[];
}

export interface TrainingScenarioDetailDto extends TrainingScenarioDto {
  items: ScenarioItemDetailDto[];
}

export interface ScenarioListItem {
  id: string;
  name: string;
  difficulty: number;
  status: ScenarioStatus;
}

export interface ScenarioService {
  code: string;
  name: string | null;
}

export interface ScenarioClassification {
  recordId: number;
  featureCodes: [number, number, number];
  finalIncidentType: string;
}

export type ScenarioTrigger =
  | { type: "TIME_OFFSET"; offsetSeconds: number }
  | { type: "AFTER_ACTION"; itemKey: string; actionType: string; delaySeconds: number };

export interface ProceduralGeneration {
  targetCount: number;
  templateIds: string[] | null;
  classificationGroupCodes: number[] | null;
}

export interface ScenarioItem {
  key: string;
  itemType: ScenarioItemType;
  trigger: ScenarioTrigger | null;
  templateName: string | null;
  classification: ScenarioClassification | null;
  mainService: ScenarioService | null;
  notificationList: ScenarioService[];
}

export interface ScenarioDetail {
  id: string;
  name: string;
  description: string | null;
  difficulty: number;
  estimatedDurationSeconds: number;
  cardsCount: number;
  mode: ScenarioMode;
  workspaceMode: ScenarioWorkspaceMode;
  completionPolicy: ScenarioCompletionPolicy;
  revision: number;
  status: ScenarioStatus;
  items: ScenarioItem[];
  procedural: ProceduralGeneration | null;
}

function toService(dto: ScenarioServiceDetailDto): ScenarioService {
  return { code: dto.code, name: dto.name };
}

export function toScenarioListItem(dto: TrainingScenarioDto): ScenarioListItem {
  return { id: dto.id, name: dto.name, difficulty: dto.difficulty, status: dto.status };
}

function toTrigger(card: ScenarioCardDefinitionDto | undefined): ScenarioTrigger | null {
  if (card === undefined) return null;
  if (card.trigger_type === "TIME_OFFSET") {
    return { type: "TIME_OFFSET", offsetSeconds: card.trigger_config.offset_seconds };
  }

  return {
    type: "AFTER_ACTION",
    itemKey: card.trigger_config.card_key,
    actionType: card.trigger_config.action_type,
    delaySeconds: card.trigger_config.delay_seconds,
  };
}

export function toScenarioDetail(dto: TrainingScenarioDetailDto): ScenarioDetail {
  const cardsByKey = new Map(dto.definition.cards.map((card) => [card.key, card]));
  const generation = dto.definition.procedural_generation;

  return {
    id: dto.id,
    name: dto.name,
    description: dto.description,
    difficulty: dto.difficulty,
    estimatedDurationSeconds: dto.estimated_duration_seconds,
    cardsCount: dto.cards_count,
    mode: dto.definition.mode,
    workspaceMode: dto.workspace_mode,
    completionPolicy: dto.completion_policy,
    revision: dto.revision,
    status: dto.status,
    procedural: generation
      ? {
          targetCount: generation.target_count,
          templateIds: generation.template_pool.template_ids ?? null,
          classificationGroupCodes: generation.template_pool.classification_group_codes ?? null,
        }
      : null,
    items: dto.items.map((item) => ({
      key: item.key,
      itemType: item.item_type,
      trigger: toTrigger(cardsByKey.get(item.key)),
      templateName: item.template_name,
      classification: item.classification && {
        recordId: item.classification.record_id,
        featureCodes: [
          item.classification.feature_1_code,
          item.classification.feature_2_code,
          item.classification.feature_3_code,
        ],
        finalIncidentType: item.classification.final_incident_type,
      },
      mainService: item.main_service && toService(item.main_service),
      notificationList: item.notification_list.map(toService),
    })),
  };
}
