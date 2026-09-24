export const lessonContractKeys = {
  all: ["lesson-contract"] as const,
  list: () => [...lessonContractKeys.all, "list"] as const,
  results: () => [...lessonContractKeys.all, "results"] as const,
  result: (lessonId: string) => [...lessonContractKeys.results(), lessonId] as const,
};
