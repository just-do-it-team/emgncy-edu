import type { ParticipantPosition, ScenarioTemplate } from "@/shared/api";
import { emptyScenarioDraft, workspaceDefaults, type ScenarioDraft } from "./scenario-draft.ts";
import { isTemplateUsable } from "./template-library.ts";

export interface ProceduralSetup {
  name: string;
  positions: ParticipantPosition[];
  targetCount: number;
  difficulty: number;
}

function hasClassification(template: ScenarioTemplate): boolean {
  const classification = template.initialCard?.classification;

  return template.recordId !== null && typeof classification === "object" && classification !== null;
}

/** Код группы классификатора из исходной карточки — по нему сервер фильтрует пул. */
export function categoryOf(template: ScenarioTemplate): number | null {
  const classification = template.initialCard?.classification;
  const code =
    typeof classification === "object" && classification !== null && !Array.isArray(classification)
      ? classification.group_code
      : undefined;

  return typeof code === "number" ? code : null;
}

/**
 * Шаблоны, которые сервер примет в процедурный пул: опубликованные активные шаблоны карточек не
 * сложнее сценария, с классификацией и в исходной карточке, и в эталоне. По службе сервер пул не
 * фильтрует, поэтому отбор по роли делается здесь и уходит списком `template_ids`: оператору 112 —
 * карточки 112, диспетчерам — карточки ДДС, которые адресованы хотя бы одной из выбранных служб.
 * Пустой список категорий — любые категории.
 */
export function proceduralPool(
  templates: ScenarioTemplate[],
  positions: ParticipantPosition[],
  difficulty: number,
  categories: number[],
): ScenarioTemplate[] {
  const services = positions.filter((position): position is string => position !== null);
  const operator = positions.includes(null);

  return templates.filter(
    (template) =>
      template.kind === "card" &&
      isTemplateUsable(template) &&
      template.difficulty <= difficulty &&
      hasClassification(template) &&
      (categories.length === 0 || categories.includes(categoryOf(template) ?? -1)) &&
      (operator
        ? template.variant === "card112"
        : template.variant === "cardDds" && template.services.some((code) => services.includes(code))),
  );
}

/**
 * Черновик процедурного сценария. Одна позиция — индивидуальное рабочее место; несколько служб ДДС —
 * общее рабочее место, где каждую службу занимает свой участник, поэтому участников ровно столько,
 * сколько служб.
 */
export function proceduralScenarioDraft(setup: ProceduralSetup, pool: ScenarioTemplate[]): ScenarioDraft {
  const { name, positions, targetCount, difficulty } = setup;
  const workspace =
    positions.length > 1
      ? { ...workspaceDefaults("SHARED"), minParticipants: positions.length, maxParticipants: positions.length }
      : workspaceDefaults("INDIVIDUAL");

  return {
    ...emptyScenarioDraft,
    ...workspace,
    name,
    difficulty,
    requiredPositions: positions,
    procedural: {
      enabled: true,
      targetCount,
      poolKind: "templates",
      templateIds: pool.map((template) => template.id),
      groupCodes: [],
    },
  };
}
