export const lessonKeys = {
  all: ["lessons"] as const,
  lists: () => [...lessonKeys.all, "list"] as const,
  list: () => [...lessonKeys.lists(), {}] as const,
  details: () => [...lessonKeys.all, "detail"] as const,
  detail: (lessonId: string) => [...lessonKeys.details(), lessonId] as const,
  summaries: () => [...lessonKeys.all, "summary"] as const,
  summary: (lessonId: string) => [...lessonKeys.summaries(), lessonId] as const,
};
