import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScenarioTemplateKind } from "@/shared/api";
import {
  archiveScenario,
  copyScenario,
  fetchScenario,
  fetchScenarios,
  fetchScenarioTemplate,
  publishScenario,
} from "./scenario-api";
import { scenarioKeys } from "./scenario.keys";

const STALE_MS = 5 * 60 * 1000;
const GC_MS = 30 * 60 * 1000;

export interface TemplateReference {
  kind: ScenarioTemplateKind;
  templateId: string;
}

export function useScenarios() {
  return useQuery({
    queryKey: scenarioKeys.list(),
    queryFn: ({ signal }) => fetchScenarios(signal),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useScenario(scenarioId: string) {
  return useQuery({
    queryKey: scenarioKeys.detail(scenarioId),
    queryFn: ({ signal }) => fetchScenario(scenarioId, signal),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useScenarioTemplates(references: TemplateReference[]) {
  return useQueries({
    queries: references.map(({ kind, templateId }) => ({
      queryKey: scenarioKeys.template(kind, templateId),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchScenarioTemplate(kind, templateId, signal),
      staleTime: STALE_MS,
      gcTime: GC_MS,
      retry: false,
      meta: { showGlobalError: false },
    })),
  });
}

function useScenarioMutation<T, R>(mutate: (request: T) => Promise<R>, scenarioIdOf: (request: T) => string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: mutate,
    retry: false,
    onSettled: (_result, _error, request) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: scenarioKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: scenarioKeys.detail(scenarioIdOf(request)) }),
      ]),
  });
}

export function usePublishScenario() {
  return useScenarioMutation(publishScenario, (request) => request.scenarioId);
}

export function useArchiveScenario() {
  return useScenarioMutation(archiveScenario, (request) => request.scenarioId);
}

export function useCopyScenario() {
  return useScenarioMutation(copyScenario, (request) => request.scenarioId);
}
