import { useQuery } from "@tanstack/react-query";
import { fetchGroups } from "./group-api";
import { groupKeys } from "./group.keys";

const SEMI_REFERENCE_STALE_MS = 5 * 60 * 1000;
const SEMI_REFERENCE_GC_MS = 30 * 60 * 1000;

export function useGroups(teacherId: string) {
  return useQuery({
    queryKey: groupKeys.list(teacherId),
    queryFn: ({ signal }) => fetchGroups(teacherId, signal),
    staleTime: SEMI_REFERENCE_STALE_MS,
    gcTime: SEMI_REFERENCE_GC_MS,
    refetchOnMount: false,
    retry: false,
    meta: { showGlobalError: false },
  });
}
