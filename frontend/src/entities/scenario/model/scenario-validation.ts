import type { ScenarioTemplate } from "@/shared/api";
import type { ScenarioDraft, ScenarioItemDraft } from "./scenario-draft.ts";
import { validateExpected, type DraftIssue, type ValidationContext } from "./template-validation.ts";
import { isDispatcherSilentAction, isKnownTriggerAction } from "./trigger-actions.ts";

const KEY_PATTERN = /^[A-Za-z0-9_.-]+$/;
const MAX_KEY_LENGTH = 100;
const MAX_NAME_LENGTH = 255;
const MAX_PARTICIPANTS = 100;
const MAX_TARGET_COUNT = 100;

export interface ScenarioValidationContext extends ValidationContext {
  templates: Map<string, ScenarioTemplate>;
  cardTemplates: ScenarioTemplate[];
}

function error(path: string, message: string): DraftIssue {
  return { path, message, severity: "error" };
}

function warning(path: string, message: string): DraftIssue {
  return { path, message, severity: "warning" };
}

function groupCodeOf(template: ScenarioTemplate): number | null {
  const classification = template.initialCard?.classification;
  const code =
    typeof classification === "object" && classification !== null && !Array.isArray(classification)
      ? classification.group_code
      : undefined;

  return typeof code === "number" ? code : template.recordId === null ? null : Math.floor(template.recordId / 1_000_000);
}

export function itemLabel(items: ScenarioItemDraft[], index: number): string {
  const item = items[index];

  if (!item) return `Элемент ${index + 1}`;

  const sameType = items.slice(0, index + 1).filter((candidate) => candidate.itemType === item.itemType).length;

  return `${item.itemType === "INCOMING_CALL" ? "Звонок" : "Карточка"} ${sameType}`;
}

function dependsOnItself(items: ScenarioItemDraft[], start: number): boolean {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const seen = new Set<string>();
  let current: ScenarioItemDraft | undefined = items[start];

  while (current && current.trigger.kind === "after") {
    if (seen.has(current.key)) return true;
    seen.add(current.key);
    current = byKey.get(current.trigger.itemKey);
  }

  return false;
}

function itemIssues(items: ScenarioItemDraft[], index: number, context: ScenarioValidationContext): DraftIssue[] {
  const item = items[index];

  if (!item) return [];

  const label = itemLabel(items, index);
  const path = `items.${index}`;
  const keyIssues =
    !KEY_PATTERN.test(item.key) || item.key.length > MAX_KEY_LENGTH
      ? [error(`${path}.key`, `${label}: ключ элемента — латиница, цифры, «_», «.», «-», до ${MAX_KEY_LENGTH} символов.`)]
      : items.findIndex((candidate) => candidate.key === item.key) !== index
        ? [error(`${path}.key`, `${label}: ключ элемента повторяется.`)]
        : [];
  const trigger = item.trigger;
  const source = trigger.kind === "after" ? items.find((candidate) => candidate.key === trigger.itemKey) : undefined;
  const triggerIssues =
    trigger.kind === "offset" && (!Number.isInteger(trigger.seconds) || trigger.seconds < 0)
      ? [error(`${path}.trigger.seconds`, `${label}: время подачи — целое число секунд, не меньше нуля.`)]
      : trigger.kind !== "after"
        ? []
        : trigger.itemKey === item.key
          ? [error(`${path}.trigger.itemKey`, `${label}: элемент не может ждать действия по самому себе.`)]
          : !source
            ? [error(`${path}.trigger.itemKey`, `${label}: выберите элемент, после действия по которому подаётся этот.`)]
            : !isKnownTriggerAction(source.itemType, trigger.actionType)
              ? [error(`${path}.trigger.actionType`, `${label}: выберите действие из списка.`)]
              : dependsOnItself(items, index)
                ? [error(`${path}.trigger.itemKey`, `${label}: условия подачи образуют цикл — элементы никогда не выйдут.`)]
                : trigger.delaySeconds < 0 || !Number.isInteger(trigger.delaySeconds)
                  ? [error(`${path}.trigger.delaySeconds`, `${label}: задержка — целое число секунд, не меньше нуля.`)]
                  : isDispatcherSilentAction(trigger.actionType)
                    ? [
                        warning(
                          `${path}.trigger.actionType`,
                          `${label}: карточку правит и меняет её статус оператор 112, диспетчер ДДС этого не делает — в занятии только для ДДС элемент может не выйти.`,
                        ),
                      ]
                    : [];

  if (item.source.kind === "TEMPLATE") {
    const template = context.templates.get(item.source.templateId);
    const expectedKind = item.itemType === "INCOMING_CALL" ? "call" : "card";
    const sourceIssues = !template
      ? [error(`${path}.source`, `${label}: шаблон не найден в библиотеке.`)]
      : template.kind !== expectedKind
        ? [error(`${path}.source`, `${label}: шаблон другого вида.`)]
        : !template.isActive
          ? [error(`${path}.source`, `${label}: шаблон деактивирован — сервер не примет сценарий. Выберите другую версию.`)]
          : [];

    return [...keyIssues, ...triggerIssues, ...sourceIssues];
  }

  if (item.itemType === "INCOMING_CALL") {
    return [...keyIssues, ...triggerIssues, error(`${path}.source`, `${label}: звонок задаётся только шаблоном.`)];
  }

  return [
    ...keyIssues,
    ...triggerIssues,
    ...validateExpected(item.source.expected, item.source.variant, "INLINE", context, `${path}.source.expected`).map(
      (issue) => ({ ...issue, message: `${label}: ${issue.message}` }),
    ),
  ];
}

export function eligiblePoolSize(draft: ScenarioDraft, cardTemplates: ScenarioTemplate[]): number {
  const { poolKind, templateIds, groupCodes } = draft.procedural;

  return cardTemplates.filter(
    (template) =>
      template.isActive &&
      template.difficulty <= draft.difficulty &&
      template.recordId !== null &&
      (poolKind !== "templates" || templateIds.includes(template.id)) &&
      (poolKind !== "groups" || groupCodes.includes(groupCodeOf(template) ?? -1)),
  ).length;
}

function proceduralIssues(draft: ScenarioDraft, context: ScenarioValidationContext): DraftIssue[] {
  const procedural = draft.procedural;

  if (!procedural.enabled) return [];

  const eligible = eligiblePoolSize(draft, context.cardTemplates);

  return [
    ...(procedural.targetCount < 1 || procedural.targetCount > MAX_TARGET_COUNT
      ? [error("procedural.targetCount", `Число карточек процедурной подачи — от 1 до ${MAX_TARGET_COUNT}.`)]
      : []),
    ...(procedural.poolKind === "templates" && procedural.templateIds.length === 0
      ? [error("procedural.templateIds", "Выберите шаблоны для пула.")]
      : []),
    ...(procedural.poolKind === "groups" && procedural.groupCodes.length === 0
      ? [error("procedural.groupCodes", "Выберите группы классификатора для пула.")]
      : []),
    ...(eligible < procedural.targetCount
      ? [
          error(
            "procedural.targetCount",
            `В пуле подходящих шаблонов ${eligible}, нужно не меньше ${procedural.targetCount}: активные шаблоны карточек сложностью не выше сценария.`,
          ),
        ]
      : []),
  ];
}

export function validateScenarioDraft(draft: ScenarioDraft, context: ScenarioValidationContext): DraftIssue[] {
  const name = draft.name.trim();
  const shared = draft.workspaceMode === "SHARED";

  return [
    ...(name === "" ? [error("name", "Укажите название сценария.")] : []),
    ...(name.length > MAX_NAME_LENGTH ? [error("name", `Название — не больше ${MAX_NAME_LENGTH} символов.`)] : []),
    ...(shared && (draft.minParticipants < 1 || draft.maxParticipants > MAX_PARTICIPANTS || draft.minParticipants > draft.maxParticipants)
      ? [error("minParticipants", `Участников — от 1 до ${MAX_PARTICIPANTS}, минимум не больше максимума.`)]
      : []),
    ...(draft.items.length === 0 && !draft.procedural.enabled
      ? [error("items", "Добавьте хотя бы один элемент или включите процедурную подачу.")]
      : []),
    ...draft.items.flatMap((_item, index) => itemIssues(draft.items, index, context)),
    ...proceduralIssues(draft, context),
  ];
}
