export type SessionStatusFilter = "RUNNING" | "ANY";

export const monitoringKeys = {
  all: ["teacher-monitoring"] as const,
  lists: () => [...monitoringKeys.all, "list"] as const,
  list: (teacherId: string, status: SessionStatusFilter) =>
    [...monitoringKeys.lists(), teacherId, status] as const,
};
