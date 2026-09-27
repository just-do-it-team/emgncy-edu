export interface AssignmentFilters {
  assignedBy: string;
  groupId?: string;
}

export const assignmentKeys = {
  all: ["scenario-assignments"] as const,
  lists: () => [...assignmentKeys.all, "list"] as const,
  list: ({ assignedBy, groupId }: AssignmentFilters) =>
    [...assignmentKeys.lists(), groupId ? { assignedBy, groupId } : { assignedBy }] as const,
};
