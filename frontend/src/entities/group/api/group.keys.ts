export const groupKeys = {
  all: ["groups"] as const,
  lists: () => [...groupKeys.all, "list"] as const,
  list: (teacherId: string) => [...groupKeys.lists(), { teacher_id: teacherId }] as const,
};
