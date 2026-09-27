import type { ScenarioTemplateKind } from "@/shared/api";

export const scenarioKeys = {
  all: ["scenarios"] as const,
  lists: () => [...scenarioKeys.all, "list"] as const,
  list: () => [...scenarioKeys.lists(), {}] as const,
  details: () => [...scenarioKeys.all, "detail"] as const,
  detail: (scenarioId: string) => [...scenarioKeys.details(), scenarioId] as const,
  templates: () => [...scenarioKeys.all, "template"] as const,
  template: (kind: ScenarioTemplateKind, templateId: string) =>
    [...scenarioKeys.templates(), kind, templateId] as const,
};
