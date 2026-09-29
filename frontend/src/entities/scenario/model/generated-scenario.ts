import type { ParticipantPosition, ScenarioTemplate } from "@/shared/api";
import { emptyScenarioDraft, workspaceDefaults, type ScenarioDraft, type ScenarioItemDraft } from "./scenario-draft.ts";

export const CALL_ITEM_KEY = "call-1";
export const CARD_FROM_CALL_ACTION = "INCIDENT_CARD_CREATED_FROM_CALL";

/**
 * Собирает черновик сценария из опубликованных шаблонов одной генерации: звонок 112 подаётся сразу,
 * карточки ДДС — после того как оператор создал карточку из вызова. Каждая служба ДДС в карточке —
 * отдельный участник, поэтому рабочее место общее: оператор 112 плюс выбранные службы.
 */
export function scenarioDraftFromTemplates(
  call: ScenarioTemplate,
  cards: ScenarioTemplate[],
  dispatcherCodes: string[],
): ScenarioDraft {
  const positions: ParticipantPosition[] = [null, ...dispatcherCodes];
  const items: ScenarioItemDraft[] = [
    { key: CALL_ITEM_KEY, itemType: "INCOMING_CALL", trigger: { kind: "immediate" }, source: { kind: "TEMPLATE", templateId: call.id } },
    ...cards.map(
      (card, index): ScenarioItemDraft => ({
        key: `card-${index + 1}`,
        itemType: "INCIDENT_CARD",
        trigger: { kind: "after", itemKey: CALL_ITEM_KEY, actionType: CARD_FROM_CALL_ACTION, delaySeconds: 0 },
        source: { kind: "TEMPLATE", templateId: card.id },
      }),
    ),
  ];

  return {
    ...emptyScenarioDraft,
    ...workspaceDefaults("SHARED"),
    minParticipants: positions.length,
    maxParticipants: positions.length,
    requiredPositions: positions,
    name: call.name,
    description: "Собран из шаблонов, сгенерированных ИИ и проверенных преподавателем.",
    difficulty: Math.max(call.difficulty, ...cards.map((card) => card.difficulty)),
    schemaVersion: 2,
    items,
  };
}
