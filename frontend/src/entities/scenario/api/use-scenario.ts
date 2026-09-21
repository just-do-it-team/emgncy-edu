import { useQuery } from "@tanstack/react-query";
import { fetchScenario, fetchScenarios } from "./scenario-api";
import { scenarioKeys } from "./scenario.keys";

const STALE_MS = 5 * 60 * 1000;
const GC_MS = 30 * 60 * 1000;

export function useScenarios() {
  return useQuery({
    queryKey: scenarioKeys.list(),
    queryFn: fetchScenarios,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useScenario(scenarioId: string) {
  return useQuery({
    queryKey: scenarioKeys.detail(scenarioId),
    queryFn: () => fetchScenario(scenarioId),
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}
