import {
  api,
  toTeacherAssignment,
  type ScenarioAssignmentDto,
  type TeacherAssignment,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import type { AssignmentFilters } from "./assignment.keys";
import { assignmentMocks, mockBatchGroups } from "./assignment.mocks";

export async function fetchAssignments(
  { assignedBy, groupId }: AssignmentFilters,
  signal?: AbortSignal,
): Promise<TeacherAssignment[]> {
  if (mocks.assignments) {
    return assignmentMocks
      .filter(
        (item) =>
          groupId === undefined ||
          (item.assignment_batch_id !== null && mockBatchGroups[item.assignment_batch_id] === groupId),
      )
      .map(toTeacherAssignment);
  }

  const { data } = await api.get<ScenarioAssignmentDto[]>(`${CARD_API_URL}/scenario-assignments`, {
    params: groupId ? { assigned_by: assignedBy, group_id: groupId } : { assigned_by: assignedBy },
    signal,
  });

  return data.map(toTeacherAssignment);
}
