import { queryOptions, useQuery } from "@tanstack/react-query";
import { fetchAssignments } from "./assignment-api";
import { assignmentKeys, type AssignmentFilters } from "./assignment.keys";

const SEMI_REFERENCE_STALE_MS = 5 * 60 * 1000;
const SEMI_REFERENCE_GC_MS = 30 * 60 * 1000;

export function assignmentsQuery(filters: AssignmentFilters) {
  return queryOptions({
    queryKey: assignmentKeys.list(filters),
    queryFn: ({ signal }) => fetchAssignments(filters, signal),
    staleTime: SEMI_REFERENCE_STALE_MS,
    gcTime: SEMI_REFERENCE_GC_MS,
    meta: { showGlobalError: false },
  });
}

export function useAssignments(filters: AssignmentFilters) {
  return useQuery(assignmentsQuery(filters));
}
