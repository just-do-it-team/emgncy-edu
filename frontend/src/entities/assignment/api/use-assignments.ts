import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cancelLesson, fetchAssignments, rescheduleLesson } from "./assignment-api";
import { assignmentKeys, type AssignmentFilters } from "./assignment.keys";

const SEMI_REFERENCE_STALE_MS = 5 * 60 * 1000;
const SEMI_REFERENCE_GC_MS = 30 * 60 * 1000;

export function useAssignments(filters: AssignmentFilters) {
  return useQuery({
    queryKey: assignmentKeys.list(filters),
    queryFn: ({ signal }) => fetchAssignments(filters, signal),
    staleTime: SEMI_REFERENCE_STALE_MS,
    gcTime: SEMI_REFERENCE_GC_MS,
    meta: { showGlobalError: false },
  });
}

export function useRescheduleLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: rescheduleLesson,
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: assignmentKeys.lists() }),
  });
}

export function useCancelLesson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelLesson,
    retry: false,
    onSettled: () => queryClient.invalidateQueries({ queryKey: assignmentKeys.lists() }),
  });
}
