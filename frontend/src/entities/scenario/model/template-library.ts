import type { ScenarioListItem, ScenarioStatus, ScenarioTemplate, TemplateVariant } from "@/shared/api";

export const templateVariantLabels: Record<TemplateVariant, string> = {
  card112: "Карточка 112",
  cardDds: "Карточка ДДС",
  call: "Звонок 112",
};

export const templateVariantOrder: TemplateVariant[] = ["call", "card112", "cardDds"];

/**
 * Что делает обучаемый с шаблоном каждого вида. Карточка 112 и звонок оцениваются одинаково — по
 * итоговому состоянию карточки, — но карточка 112 появляется уже заполненной, без звонка и без
 * создания карточки обучаемым.
 */
export const templateVariantHints: Record<TemplateVariant, string> = {
  call: "обучаемый принимает звонок, говорит с заявителем и сам создаёт карточку",
  card112: "готовая карточка без звонка: приходит заполненной, оценивается её итоговое состояние",
  cardDds: "карточка поступает диспетчеру службы: принять или отклонить, вести статусы реагирования",
};

export function templateSourceLabel(template: ScenarioTemplate): string {
  return template.generatedByAi ? "сгенерирован ИИ" : "создан вручную";
}

export function templateAuthorLabel(template: ScenarioTemplate, teacherId: string): string {
  return template.createdBy === teacherId ? "Вы" : (template.createdByName ?? "Другой преподаватель");
}

export interface TemplateEntry {
  templateKey: string;
  latest: ScenarioTemplate;
  versions: ScenarioTemplate[];
}

export interface TemplateUsage {
  scenarioId: string;
  scenarioName: string;
  scenarioStatus: ScenarioStatus;
  scenarioRevision: number;
  scenarioCreatedBy: string;
  templateId: string;
  version: number;
  outdated: boolean;
}

export function isTemplateUsable(template: ScenarioTemplate): boolean {
  return template.isActive && template.status === "PUBLISHED";
}

export function isAiDraft(template: ScenarioTemplate): boolean {
  return template.isActive && template.status === "DRAFT";
}

export type TemplateState = "published" | "aiDraft" | "draft" | "archived";

export function templateState(template: ScenarioTemplate): TemplateState {
  if (!template.isActive || template.status === "ARCHIVED") return "archived";
  if (template.status === "DRAFT") return template.generatedByAi ? "aiDraft" : "draft";

  return "published";
}

export const templateStateLabels: Record<TemplateState, string> = {
  published: "Опубликован",
  aiDraft: "Черновик ИИ — требует проверки",
  draft: "Черновик",
  archived: "В архиве",
};

export type TemplateProblem = "missing" | "aiDraft" | "draft" | "archived";

/** Почему шаблон нельзя взять в сценарий: сервер принимает только активную опубликованную версию. */
export function templateProblem(template: ScenarioTemplate | undefined): TemplateProblem | null {
  if (template === undefined) return "missing";
  if (isTemplateUsable(template)) return null;

  const state = templateState(template);

  return state === "published" ? "archived" : state;
}

export function templateProblemText(problem: TemplateProblem, template: ScenarioTemplate | undefined): string {
  if (problem === "missing" || template === undefined) return "шаблон не найден на сервере";
  if (problem === "aiDraft") return "черновик ИИ, ещё не проверен и не опубликован";
  if (problem === "draft") return "черновик, ещё не опубликован";

  return `версия ${template.version} деактивирована`;
}

/**
 * Актуальная версия того же шаблона: старшая активная опубликованная версия с тем же ключом и видом.
 * Её предлагается подставить вместо деактивированной или устаревшей: сервер не сохранит сценарий
 * со ссылкой на деактивированную версию, а на новую версию сам не переключает.
 */
export function actualVersionOf(entries: TemplateEntry[], template: ScenarioTemplate): ScenarioTemplate | null {
  const entry = entries.find((candidate) => candidate.versions.some((version) => version.id === template.id));
  const actual = entry?.versions.find(isTemplateUsable);

  return actual !== undefined && actual.id !== template.id ? actual : null;
}

export function groupTemplates(templates: ScenarioTemplate[]): TemplateEntry[] {
  const byKey = new Map<string, ScenarioTemplate[]>();

  for (const template of templates) {
    const key = `${template.kind}:${template.templateKey}`;

    byKey.set(key, [...(byKey.get(key) ?? []), template]);
  }

  return [...byKey.values()].flatMap((group) => {
    const versions = [...group].sort((first, second) => second.version - first.version);
    const [latest] = versions;

    return latest ? [{ templateKey: latest.templateKey, latest, versions }] : [];
  });
}

export function templateUsages(entry: TemplateEntry, scenarios: ScenarioListItem[]): TemplateUsage[] {
  const versionById = new Map(entry.versions.map((template) => [template.id, template.version]));

  return scenarios.flatMap((scenario) =>
    [...new Set(scenario.templateIds)].flatMap((templateId) => {
      const version = versionById.get(templateId);

      return version === undefined
        ? []
        : [
            {
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              scenarioStatus: scenario.status,
              scenarioRevision: scenario.revision,
              scenarioCreatedBy: scenario.createdBy,
              templateId,
              version,
              outdated: version < entry.latest.version,
            },
          ];
    }),
  );
}

export function activeUsages(usages: TemplateUsage[]): TemplateUsage[] {
  return usages.filter((usage) => usage.scenarioStatus !== "ARCHIVED");
}

export interface TemplateUpgradeBody {
  updated_by: string;
  scenarios: { scenario_id: string; expected_revision: number }[];
}

export function upgradeCandidates(usages: TemplateUsage[], userId: string): TemplateUsage[] {
  const seen = new Set<string>();

  return usages.filter((usage) => {
    if (usage.scenarioCreatedBy !== userId || usage.scenarioStatus !== "DRAFT" || !usage.outdated) return false;
    if (seen.has(usage.scenarioId)) return false;

    seen.add(usage.scenarioId);
    return true;
  });
}

export function upgradeScenariosBody(userId: string, selected: TemplateUsage[]): TemplateUpgradeBody {
  const revisions = new Map(selected.map((usage) => [usage.scenarioId, usage.scenarioRevision]));

  return {
    updated_by: userId,
    scenarios: [...revisions].map(([scenarioId, revision]) => ({ scenario_id: scenarioId, expected_revision: revision })),
  };
}
