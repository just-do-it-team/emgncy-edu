import { useQuery } from "@tanstack/react-query";
import {
  fetchAttempt,
  fetchLessonAttempts,
  fetchMyAttempts,
  fetchTodayAttempts,
} from "./attempt-api";
import { attemptKeys } from "./attempt.keys";

const SNAPSHOT_GC_MS = 30 * 60 * 1000;
const LIST_STALE_MS = 30 * 1000;
const LIST_GC_MS = 5 * 60 * 1000;

export function useAttempt(attemptId: string) {
  return useQuery({
    queryKey: attemptKeys.detail(attemptId),
    queryFn: () => fetchAttempt(attemptId),
    staleTime: Infinity,
    gcTime: SNAPSHOT_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useLessonAttempts(lessonId: string) {
  return useQuery({
    queryKey: attemptKeys.lessonList(lessonId),
    queryFn: () => fetchLessonAttempts(lessonId),
    staleTime: LIST_STALE_MS,
    gcTime: LIST_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useTodayAttempts() {
  return useQuery({
    queryKey: attemptKeys.today(),
    queryFn: fetchTodayAttempts,
    staleTime: LIST_STALE_MS,
    gcTime: LIST_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useMyAttempts() {
  return useQuery({
    queryKey: attemptKeys.mine(),
    queryFn: fetchMyAttempts,
    staleTime: LIST_STALE_MS,
    gcTime: LIST_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}
