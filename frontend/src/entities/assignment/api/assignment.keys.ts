export interface AssignmentFilters {
  assignedBy: string;
}

export const assignmentKeys = {
  all: ["scenario-assignments"] as const,
  lists: () => [...assignmentKeys.all, "list"] as const,
  list: ({ assignedBy }: AssignmentFilters) => [...assignmentKeys.lists(), { assignedBy }] as const,
};
