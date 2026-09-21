import { useQuery } from "@tanstack/react-query";
import { fetchLesson, fetchLessons, fetchLessonSummary } from "./lesson-api";
import { lessonKeys } from "./lesson.keys";

const LIST_STALE_MS = 30 * 1000;
const LIST_GC_MS = 5 * 60 * 1000;
const DETAIL_STALE_MS = 5 * 60 * 1000;
const DETAIL_GC_MS = 30 * 60 * 1000;

export function useLessons() {
  return useQuery({
    queryKey: lessonKeys.list(),
    queryFn: fetchLessons,
    staleTime: LIST_STALE_MS,
    gcTime: LIST_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useLesson(lessonId: string) {
  return useQuery({
    queryKey: lessonKeys.detail(lessonId),
    queryFn: () => fetchLesson(lessonId),
    staleTime: DETAIL_STALE_MS,
    gcTime: DETAIL_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useLessonSummary(lessonId: string) {
  return useQuery({
    queryKey: lessonKeys.summary(lessonId),
    queryFn: () => fetchLessonSummary(lessonId),
    staleTime: DETAIL_STALE_MS,
    gcTime: DETAIL_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}
