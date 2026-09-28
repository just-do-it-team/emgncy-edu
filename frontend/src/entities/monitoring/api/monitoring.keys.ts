export type SessionStatusFilter = "RUNNING" | "ANY";

export const monitoringKeys = {
  all: ["teacher-monitoring"] as const,
  lists: () => [...monitoringKeys.all, "list"] as const,
  list: (teacherId: string, status: SessionStatusFilter) =>
    [...monitoringKeys.lists(), teacherId, status] as const,
  actionLists: () => [...monitoringKeys.all, "actions"] as const,
  actions: (sessionId: string) => [...monitoringKeys.actionLists(), sessionId] as const,
};
