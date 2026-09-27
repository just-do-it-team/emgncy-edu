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
