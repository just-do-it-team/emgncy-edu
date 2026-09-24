import { useQuery } from "@tanstack/react-query";
import { fetchContractLessons, fetchLessonResults } from "./lesson-contract-api";
import { lessonContractKeys } from "./lesson-contract.keys";

const LIST_STALE_MS = 30 * 1000;
const LIST_GC_MS = 5 * 60 * 1000;

export function useContractLessons() {
  return useQuery({
    queryKey: lessonContractKeys.list(),
    queryFn: ({ signal }) => fetchContractLessons(signal),
    staleTime: LIST_STALE_MS,
    gcTime: LIST_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export function useLessonResults(lessonId: string) {
  return useQuery({
    queryKey: lessonContractKeys.result(lessonId),
    queryFn: ({ signal }) => fetchLessonResults(lessonId, signal),
    staleTime: LIST_STALE_MS,
    gcTime: LIST_GC_MS,
    retry: false,
    meta: { showGlobalError: false },
  });
}
