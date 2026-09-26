export const studentKeys = {
  all: ["students"] as const,
  directories: () => [...studentKeys.all, "directory"] as const,
  directory: (teacherId: string) => [...studentKeys.directories(), teacherId] as const,
  histories: () => [...studentKeys.all, "training-history"] as const,
  history: (studentId: string, teacherId: string) =>
    [...studentKeys.histories(), studentId, teacherId] as const,
};
