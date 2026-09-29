import type {
  GeneratedScenarioDto,
  JsonObject,
  JsonValue,
  OperatorClassificationDto,
  ParticipantPosition,
  ScenarioCardDefinitionDto,
  ScenarioCompletionPolicy,
  ScenarioDefinitionDto,
  ScenarioDetail,
  ScenarioItemType,
  ScenarioTriggerDto,
  ScenarioWorkspaceMode,
  TrainingScenarioCreateDto,
  TrainingScenarioUpdateDto,
} from "@/shared/api";
import {
  cardSourceFromJson,
  expectedFromJson,
  expectedResultBody,
  initialCardBody,
  type CardSourceDraft,
  type ExpectedDraft,
} from "./expected-draft.ts";

export type InlineVariant = "card112" | "cardDds";

export type TriggerDraft =
  | { kind: "immediate" }
  | { kind: "offset"; seconds: number }
  | { kind: "after"; itemKey: string; actionType: string; delaySeconds: number };

export type ItemSourceDraft =
  | { kind: "TEMPLATE"; templateId: string }
  | { kind: "INLINE"; variant: InlineVariant; card: CardSourceDraft; expected: ExpectedDraft };

export interface ScenarioItemDraft {
  key: string;
  itemType: ScenarioItemType;
  trigger: TriggerDraft;
  source: ItemSourceDraft;
}

export type PoolKind = "all" | "templates" | "groups";

export interface ProceduralDraft {
  enabled: boolean;
  targetCount: number;
  poolKind: PoolKind;
  templateIds: string[];
  groupCodes: number[];
}

export interface ScenarioDraft {
  name: string;
  description: string;
  difficulty: number;
  workspaceMode: ScenarioWorkspaceMode;
  completionPolicy: ScenarioCompletionPolicy;
  minParticipants: number;
  maxParticipants: number;
  passingScore: number;
  requiredPositions: ParticipantPosition[] | null;
  schemaVersion: number;
  items: ScenarioItemDraft[];
  procedural: ProceduralDraft;
}

export const MAX_PASSING_SCORE = 100;

export const PROCEDURAL_KEY = "procedural-cards";
export const DEFAULT_TRIGGER_STEP_SECONDS = 120;
const SHARED_DEFAULT_MAX = 4;

export const emptyProcedural: ProceduralDraft = {
  enabled: false,
  targetCount: 5,
  poolKind: "all",
  templateIds: [],
  groupCodes: [],
};

export const emptyScenarioDraft: ScenarioDraft = {
  name: "",
  description: "",
  difficulty: 1,
  workspaceMode: "INDIVIDUAL",
  completionPolicy: "STUDENT_CONFIRM",
  minParticipants: 1,
  maxParticipants: 1,
  passingScore: MAX_PASSING_SCORE,
  requiredPositions: null,
  schemaVersion: 1,
  items: [],
  procedural: emptyProcedural,
};

export function workspaceDefaults(mode: ScenarioWorkspaceMode): Pick<
  ScenarioDraft,
  "workspaceMode" | "completionPolicy" | "minParticipants" | "maxParticipants" | "requiredPositions"
> {
  return mode === "SHARED"
    ? {
        workspaceMode: "SHARED",
        completionPolicy: "TEACHER_ONLY",
        minParticipants: 2,
        maxParticipants: SHARED_DEFAULT_MAX,
        requiredPositions: null,
      }
    : {
        workspaceMode: "INDIVIDUAL",
        completionPolicy: "STUDENT_CONFIRM",
        minParticipants: 1,
        maxParticipants: 1,
        requiredPositions: null,
      };
}

export function nextItemKey(items: ScenarioItemDraft[], itemType: ScenarioItemType): string {
  const prefix = itemType === "INCOMING_CALL" ? "call" : "card";
  const taken = new Set(items.map((item) => item.key));
  let index = items.length + 1;

  while (taken.has(`${prefix}-${index}`)) index += 1;

  return `${prefix}-${index}`;
}

export function defaultTrigger(position: number): TriggerDraft {
  return position === 0 ? { kind: "immediate" } : { kind: "offset", seconds: position * DEFAULT_TRIGGER_STEP_SECONDS };
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;

  const next = [...items];
  const [moved] = next.splice(from, 1);

  if (moved !== undefined) next.splice(to, 0, moved);

  return next;
}

/**
 * Удаляет элемент состава. Элементы, которые ждали действия по удалённому, переводятся на подачу
 * по времени: иначе условие ссылалось бы на несуществующий элемент и сценарий не сохранился бы.
 */
export function removeItem(items: ScenarioItemDraft[], index: number): ScenarioItemDraft[] {
  const removed = items[index];

  if (removed === undefined) return items;

  return items
    .filter((_item, position) => position !== index)
    .map((item, position) =>
      item.trigger.kind === "after" && item.trigger.itemKey === removed.key ? { ...item, trigger: defaultTrigger(position) } : item,
    );
}

function triggerDto(trigger: TriggerDraft): ScenarioTriggerDto {
  if (trigger.kind === "after") {
    return {
      trigger_type: "AFTER_ACTION",
      trigger_config: { card_key: trigger.itemKey, action_type: trigger.actionType, delay_seconds: trigger.delaySeconds },
    };
  }

  return { trigger_type: "TIME_OFFSET", trigger_config: { offset_seconds: trigger.kind === "offset" ? trigger.seconds : 0 } };
}

export type ClassificationResolver = (recordId: number, flags: Record<string, boolean>) => OperatorClassificationDto | null;

function cardDto(item: ScenarioItemDraft, classificationFor: ClassificationResolver): ScenarioCardDefinitionDto {
  const trigger = triggerDto(item.trigger);
  const base = { key: item.key, item_type: item.itemType };

  if (item.source.kind === "TEMPLATE") {
    return { ...base, ...trigger, source_type: "TEMPLATE", template_id: item.source.templateId };
  }

  const { expected, card, variant } = item.source;
  const classification =
    expected.recordId === null ? null : classificationFor(expected.recordId, expected.flags);

  if (classification === null) throw new Error(`Классификация элемента ${item.key} не найдена`);

  return {
    ...base,
    ...trigger,
    source_type: "INLINE",
    initial_card: initialCardBody(card, expected, classification),
    expected_result: expectedResultBody(expected, "INLINE", variant === "cardDds", classification),
  };
}

export function definitionBody(draft: ScenarioDraft, classificationFor: ClassificationResolver): ScenarioDefinitionDto {
  const procedural = draft.procedural.enabled;
  const hasCalls = draft.items.some((item) => item.itemType === "INCOMING_CALL");
  const required = procedural ? 3 : hasCalls ? 2 : 1;
  const pool =
    draft.procedural.poolKind === "templates"
      ? { template_ids: [...draft.procedural.templateIds] }
      : draft.procedural.poolKind === "groups"
        ? { classification_group_codes: [...draft.procedural.groupCodes] }
        : {};

  return {
    schema_version: Math.max(draft.schemaVersion, required),
    mode: procedural ? (draft.items.length > 0 ? "HYBRID" : "PROCEDURAL") : "STATIC",
    cards: draft.items.map((item) => cardDto(item, classificationFor)),
    ...(procedural
      ? { procedural_generation: { key: PROCEDURAL_KEY, target_count: draft.procedural.targetCount, template_pool: pool } }
      : {}),
  };
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function commonBody(draft: ScenarioDraft, classificationFor: ClassificationResolver, durationSeconds: number) {
  return {
    name: draft.name.trim(),
    description: trimmedOrNull(draft.description),
    difficulty: draft.difficulty,
    estimated_duration_seconds: durationSeconds,
    passing_score: draft.passingScore,
    workspace_mode: draft.workspaceMode,
    completion_policy: draft.workspaceMode === "SHARED" ? "TEACHER_ONLY" : draft.completionPolicy,
    min_participants: draft.workspaceMode === "SHARED" ? draft.minParticipants : 1,
    max_participants: draft.workspaceMode === "SHARED" ? draft.maxParticipants : 1,
    required_participant_positions: draft.requiredPositions,
    definition: definitionBody(draft, classificationFor),
  } satisfies Omit<TrainingScenarioCreateDto, "status" | "created_by">;
}

export function scenarioCreateBody(
  draft: ScenarioDraft,
  classificationFor: ClassificationResolver,
  durationSeconds: number,
  userId: string,
): TrainingScenarioCreateDto {
  return { ...commonBody(draft, classificationFor, durationSeconds), status: "DRAFT", created_by: userId };
}

export function scenarioUpdateBody(
  draft: ScenarioDraft,
  classificationFor: ClassificationResolver,
  durationSeconds: number,
  userId: string,
  revision: number,
): TrainingScenarioUpdateDto {
  return {
    ...commonBody(draft, classificationFor, durationSeconds),
    expected_revision: revision,
    updated_by: userId,
  };
}

function isDispatcherResult(expected: JsonObject): boolean {
  const present = (value: JsonValue | undefined) => value !== undefined && value !== null;

  return present(expected.service_status_history) || present(expected.outbound_call);
}

export function scenarioDraftFromDetail(detail: ScenarioDetail): ScenarioDraft {
  const items = detail.items.map((item): ScenarioItemDraft => {
    const trigger: TriggerDraft =
      item.trigger?.type === "AFTER_ACTION"
        ? {
            kind: "after",
            itemKey: item.trigger.itemKey,
            actionType: item.trigger.actionType,
            delaySeconds: item.trigger.delaySeconds,
          }
        : item.trigger && item.trigger.offsetSeconds > 0
          ? { kind: "offset", seconds: item.trigger.offsetSeconds }
          : { kind: "immediate" };

    if (item.sourceType === "TEMPLATE" && item.templateId !== null) {
      return { key: item.key, itemType: item.itemType, trigger, source: { kind: "TEMPLATE", templateId: item.templateId } };
    }

    const expectedJson = item.inlineExpectedResult ?? { card: item.expectedCard ?? {} };
    const expected = expectedFromJson(expectedJson, "INLINE");

    return {
      key: item.key,
      itemType: item.itemType,
      trigger,
      source: {
        kind: "INLINE",
        variant: isDispatcherResult(expectedJson) ? "cardDds" : "card112",
        card: cardSourceFromJson(item.inlineInitialCard, expected),
        expected,
      },
    };
  });
  const generation = detail.procedural;

  return {
    name: detail.name,
    description: detail.description ?? "",
    difficulty: detail.difficulty,
    workspaceMode: detail.workspaceMode,
    completionPolicy: detail.completionPolicy,
    minParticipants: detail.minParticipants,
    maxParticipants: detail.maxParticipants,
    passingScore: detail.passingScore,
    requiredPositions: detail.requiredPositions,
    schemaVersion: detail.schemaVersion,
    items,
    procedural: generation
      ? {
          enabled: true,
          targetCount: generation.targetCount,
          poolKind: generation.templateIds ? "templates" : generation.classificationGroupCodes ? "groups" : "all",
          templateIds: generation.templateIds ?? [],
          groupCodes: generation.classificationGroupCodes ?? [],
        }
      : emptyProcedural,
  };
}

function triggerFromDefinition(card: ScenarioCardDefinitionDto): TriggerDraft {
  if (card.trigger_type === "AFTER_ACTION") {
    return {
      kind: "after",
      itemKey: card.trigger_config.card_key,
      actionType: card.trigger_config.action_type,
      delaySeconds: card.trigger_config.delay_seconds,
    };
  }

  return card.trigger_config.offset_seconds > 0
    ? { kind: "offset", seconds: card.trigger_config.offset_seconds }
    : { kind: "immediate" };
}

function itemFromDefinition(card: ScenarioCardDefinitionDto): ScenarioItemDraft {
  const trigger = triggerFromDefinition(card);

  if (card.source_type === "TEMPLATE" && card.template_id !== undefined) {
    return { key: card.key, itemType: card.item_type, trigger, source: { kind: "TEMPLATE", templateId: card.template_id } };
  }

  const expectedJson = card.expected_result ?? { card: {} };
  const expected = expectedFromJson(expectedJson, "INLINE");

  return {
    key: card.key,
    itemType: card.item_type,
    trigger,
    source: {
      kind: "INLINE",
      variant: isDispatcherResult(expectedJson) ? "cardDds" : "card112",
      card: cardSourceFromJson(card.initial_card ?? null, expected),
      expected,
    },
  };
}

export function scenarioDraftFromGenerated(scenario: GeneratedScenarioDto): ScenarioDraft {
  return {
    name: scenario.name,
    description: scenario.description ?? "",
    difficulty: scenario.difficulty,
    workspaceMode: scenario.workspace_mode,
    completionPolicy: scenario.completion_policy,
    minParticipants: scenario.min_participants,
    maxParticipants: scenario.max_participants,
    passingScore: scenario.passing_score,
    requiredPositions: scenario.required_participant_positions,
    schemaVersion: scenario.definition.schema_version,
    items: scenario.definition.cards.map(itemFromDefinition),
    procedural: emptyProcedural,
  };
}
