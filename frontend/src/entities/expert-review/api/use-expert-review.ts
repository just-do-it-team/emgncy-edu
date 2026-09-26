import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExpertAssessmentRequestDto, ExpertReviewContext } from "@/shared/api";
import {
  fetchExpertReviewContext,
  fetchReviewAssignment,
  updateExpertAssessment,
} from "./expert-review-api";
import { expertReviewKeys } from "./expert-review.keys";

const CONTEXT_STALE_MS = 15 * 1000;
const CONTEXT_GC_MS = 5 * 60 * 1000;
const ASSIGNMENT_STALE_MS = 5 * 60 * 1000;
const ASSIGNMENT_GC_MS = 30 * 60 * 1000;

export function useExpertReviewContext(trainingSessionId: string, teacherId: string) {
  return useQuery({
    queryKey: expertReviewKeys.context(trainingSessionId, teacherId),
    queryFn: ({ signal }) => fetchExpertReviewContext(trainingSessionId, teacherId, signal),
    staleTime: CONTEXT_STALE_MS,
    gcTime: CONTEXT_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useReviewAssignment(assignmentId: string) {
  return useQuery({
    queryKey: expertReviewKeys.assignment(assignmentId),
    queryFn: ({ signal }) => fetchReviewAssignment(assignmentId, signal),
    staleTime: ASSIGNMENT_STALE_MS,
    gcTime: ASSIGNMENT_GC_MS,
    refetchOnMount: false,
    meta: { showGlobalError: false },
  });
}

export function useUpdateExpertAssessment(trainingSessionId: string, teacherId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: Omit<ExpertAssessmentRequestDto, "teacher_id">) =>
      updateExpertAssessment(trainingSessionId, { ...body, teacher_id: teacherId }),
    retry: false,
    onSuccess: (session) => {
      queryClient.setQueryData<ExpertReviewContext>(
        expertReviewKeys.context(trainingSessionId, teacherId),
        (context) => context && { ...context, session },
      );
    },
  });
}
