import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScenarioTemplateKind } from "@/shared/api";
import { scenarioKeys } from "./scenario.keys";
import { createTemplate, deactivateTemplate, fetchScenarioTemplate, fetchTemplates } from "./template-api";

const STALE_MS = 5 * 60 * 1000;
const GC_MS = 30 * 60 * 1000;

export interface TemplateReference {
  kind: ScenarioTemplateKind;
  templateId: string;
}

function templateQuery({ kind, templateId }: TemplateReference) {
  return {
    queryKey: scenarioKeys.template(kind, templateId),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchScenarioTemplate(kind, templateId, signal),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  };
}

export function useTemplates() {
  return useQuery({
    queryKey: scenarioKeys.templateList(),
    queryFn: ({ signal }) => fetchTemplates(signal),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useTemplate(reference: TemplateReference) {
  return useQuery(templateQuery(reference));
}

export function useScenarioTemplates(references: TemplateReference[]) {
  return useQueries({ queries: references.map(templateQuery) });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTemplate,
    retry: false,
    onSuccess: (template) =>
      queryClient.setQueryData(scenarioKeys.template(template.kind, template.id), template),
    onSettled: () => queryClient.invalidateQueries({ queryKey: scenarioKeys.templateList() }),
  });
}

export function useDeactivateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deactivateTemplate,
    retry: false,
    onSettled: (_result, _error, request) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: scenarioKeys.templateList() }),
        queryClient.invalidateQueries({ queryKey: scenarioKeys.template(request.kind, request.templateId) }),
        queryClient.invalidateQueries({ queryKey: scenarioKeys.lists() }),
      ]),
  });
}
