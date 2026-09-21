export const attemptKeys = {
  all: ["attempts"] as const,
  lists: () => [...attemptKeys.all, "list"] as const,
  lessonList: (lessonId: string) => [...attemptKeys.lists(), { lesson_id: lessonId }] as const,
  mine: () => [...attemptKeys.lists(), { scope: "mine" }] as const,
  today: () => [...attemptKeys.lists(), { day: "today" }] as const,
  details: () => [...attemptKeys.all, "detail"] as const,
  detail: (attemptId: string) => [...attemptKeys.details(), attemptId] as const,
};
