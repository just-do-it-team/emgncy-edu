import { decimal } from "./decimal";
import type { JsonObject } from "./json";

export type ScenarioStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type ScenarioWorkspaceMode = "INDIVIDUAL" | "SHARED";

export type ScenarioItemType = "INCIDENT_CARD" | "INCOMING_CALL";

export type ScenarioMode = "STATIC" | "PROCEDURAL" | "HYBRID";

export type ScenarioCompletionPolicy = "STUDENT_CONFIRM" | "AUTO_WHEN_READY" | "TEACHER_ONLY";

export type ScenarioSourceType = "TEMPLATE" | "INLINE";

export type ScenarioTriggerDto =
  | { trigger_type: "TIME_OFFSET"; trigger_config: { offset_seconds: number } }
  | {
      trigger_type: "AFTER_ACTION";
      trigger_config: { card_key: string; action_type: string; delay_seconds: number };
    };

export type ScenarioCardDefinitionDto = {
  key: string;
  item_type: ScenarioItemType;
  source_type: ScenarioSourceType;
  template_id?: string;
  initial_card?: JsonObject;
  expected_result?: JsonObject;
} & ScenarioTriggerDto;

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
  passing_score: string;
  cards_count: number;
  workspace_mode: ScenarioWorkspaceMode;
  completion_policy: ScenarioCompletionPolicy;
  min_participants: number;
  max_participants: number;
  required_participant_positions: ParticipantPosition[] | null;
  definition: ScenarioDefinitionDto;
  revision: number;
  status: ScenarioStatus;
  created_by: string;
  created_by_name: string | null;
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
  source_type: ScenarioSourceType;
  template_id: string | null;
  template_name: string | null;
  initial_card: JsonObject | null;
  expected_card: JsonObject | null;
  classification: OperatorClassificationDto | null;
  main_service: ScenarioServiceDetailDto | null;
  notification_list: ScenarioServiceDetailDto[];
}

export interface TrainingScenarioDetailDto extends TrainingScenarioDto {
  items: ScenarioItemDetailDto[];
}

export interface TrainingScenarioUpdateDto extends Omit<TrainingScenarioCreateDto, "status" | "created_by"> {
  expected_revision: number;
  updated_by: string;
}

export interface TrainingScenarioCreateDto {
  name: string;
  description: string | null;
  difficulty: number;
  estimated_duration_seconds: number;
  passing_score: number;
  workspace_mode: ScenarioWorkspaceMode;
  completion_policy: ScenarioCompletionPolicy;
  min_participants: number;
  max_participants: number;
  required_participant_positions: ParticipantPosition[] | null;
  definition: ScenarioDefinitionDto;
  status: ScenarioStatus;
  created_by: string;
}

export type ParticipantPosition = string | null;

export const DEFAULT_PASSING_SCORE = 100;

export interface ScenarioComposition {
  itemTypes: ScenarioItemType[];
  procedural: boolean;
}

export interface ScenarioListItem {
  id: string;
  name: string;
  revision: number;
  difficulty: number;
  passingScore: number;
  requiredPositions: ParticipantPosition[] | null;
  status: ScenarioStatus;
  createdBy: string;
  createdByName: string | null;
  updatedAt: string;
  itemsCount: number;
  composition: ScenarioComposition;
  templateIds: string[];
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
  sourceType: ScenarioSourceType;
  templateId: string | null;
  trigger: ScenarioTrigger | null;
  templateName: string | null;
  expectedCard: JsonObject | null;
  inlineInitialCard: JsonObject | null;
  inlineExpectedResult: JsonObject | null;
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
  passingScore: number;
  requiredPositions: ParticipantPosition[] | null;
  cardsCount: number;
  schemaVersion: number;
  mode: ScenarioMode;
  workspaceMode: ScenarioWorkspaceMode;
  completionPolicy: ScenarioCompletionPolicy;
  minParticipants: number;
  maxParticipants: number;
  revision: number;
  status: ScenarioStatus;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  composition: ScenarioComposition;
  items: ScenarioItem[];
  procedural: ProceduralGeneration | null;
}

function toService(dto: ScenarioServiceDetailDto): ScenarioService {
  return { code: dto.code, name: dto.name };
}

export function definitionTemplateIds(definition: ScenarioDefinitionDto): string[] {
  return [
    ...definition.cards.flatMap((card) => (card.template_id === undefined ? [] : [card.template_id])),
    ...(definition.procedural_generation?.template_pool.template_ids ?? []),
  ];
}

function toComposition(definition: ScenarioDefinitionDto): ScenarioComposition {
  return {
    itemTypes: definition.cards.map((card) => card.item_type),
    procedural: definition.procedural_generation !== undefined,
  };
}

export function toScenarioListItem(dto: TrainingScenarioDto): ScenarioListItem {
  return {
    id: dto.id,
    name: dto.name,
    revision: dto.revision,
    difficulty: dto.difficulty,
    passingScore: decimal(dto.passing_score) ?? DEFAULT_PASSING_SCORE,
    requiredPositions: dto.required_participant_positions,
    status: dto.status,
    createdBy: dto.created_by,
    createdByName: dto.created_by_name,
    updatedAt: dto.updated_at,
    itemsCount: dto.cards_count,
    composition: toComposition(dto.definition),
    templateIds: definitionTemplateIds(dto.definition),
  };
}

export function toScenarioCopy(dto: TrainingScenarioDto, name: string, createdBy: string): TrainingScenarioCreateDto {
  return {
    name,
    description: dto.description,
    difficulty: dto.difficulty,
    estimated_duration_seconds: dto.estimated_duration_seconds,
    passing_score: decimal(dto.passing_score) ?? DEFAULT_PASSING_SCORE,
    required_participant_positions: dto.required_participant_positions,
    workspace_mode: dto.workspace_mode,
    completion_policy: dto.completion_policy,
    min_participants: dto.min_participants,
    max_participants: dto.max_participants,
    definition: dto.definition,
    status: "DRAFT",
    created_by: createdBy,
  };
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
    passingScore: decimal(dto.passing_score) ?? DEFAULT_PASSING_SCORE,
    requiredPositions: dto.required_participant_positions,
    cardsCount: dto.cards_count,
    schemaVersion: dto.definition.schema_version,
    mode: dto.definition.mode,
    workspaceMode: dto.workspace_mode,
    completionPolicy: dto.completion_policy,
    minParticipants: dto.min_participants,
    maxParticipants: dto.max_participants,
    revision: dto.revision,
    status: dto.status,
    createdBy: dto.created_by,
    createdByName: dto.created_by_name,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
    composition: toComposition(dto.definition),
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
      sourceType: item.source_type,
      templateId: item.template_id,
      trigger: toTrigger(cardsByKey.get(item.key)),
      templateName: item.template_name,
      expectedCard: item.expected_card,
      inlineInitialCard: cardsByKey.get(item.key)?.initial_card ?? null,
      inlineExpectedResult: cardsByKey.get(item.key)?.expected_result ?? null,
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
