import type { ScenarioListItem, ScenarioStatus, ScenarioTemplate, TemplateVariant } from "@/shared/api";

export const templateVariantLabels: Record<TemplateVariant, string> = {
  card112: "Карточка 112",
  cardDds: "Карточка ДДС",
  call: "Звонок",
};

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
