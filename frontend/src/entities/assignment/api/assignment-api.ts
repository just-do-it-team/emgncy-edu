import {
  api,
  RequestError,
  toTeacherAssignment,
  type AssignmentBatchDto,
  type GroupAssignmentCreateDto,
  type ScenarioAssignmentDto,
  type ScenarioWorkspaceMode,
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

export interface GroupAssignmentRequest {
  groupId: string;
  body: GroupAssignmentCreateDto;
  scenario: { name: string; revision: number; workspaceMode: ScenarioWorkspaceMode };
}

export interface CreatedBatch {
  batchId: string;
  assignmentIds: string[];
}

const VALIDATION = 422;

function mockBatch({ groupId, body, scenario }: GroupAssignmentRequest): CreatedBatch {
  const participantSets =
    scenario.workspaceMode === "INDIVIDUAL" ? body.participant_ids.map((id) => [id]) : [body.participant_ids];
  const positions = body.participant_ids.map((id) => body.participant_positions[id] ?? null).filter(Boolean);

  if (new Set(positions).size !== positions.length) {
    throw new RequestError(VALIDATION, "Only one participant may occupy each DDS position");
  }

  const batchId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const created = participantSets.map(
    (participantIds): ScenarioAssignmentDto => ({
      id: crypto.randomUUID(),
      scenario_id: body.scenario_id,
      scenario_name: scenario.name,
      scenario_revision: scenario.revision,
      assignment_batch_id: batchId,
      assigned_by: body.assigned_by,
      workspace_mode: scenario.workspaceMode,
      launch_policy: body.launch_policy,
      max_attempts: body.max_attempts,
      status: "ASSIGNED",
      available_from: body.available_from,
      due_at: body.due_at,
      created_at: createdAt,
      participants: participantIds.map((userId) => {
        const position = body.participant_positions[userId] ?? null;

        return {
          user_id: userId,
          status: "ASSIGNED",
          position_code: position,
          participant_role: position === null ? "OPERATOR_112" : "DDS",
          ready_at: null,
          completed_at: null,
        };
      }),
    }),
  );

  assignmentMocks.push(...created);
  mockBatchGroups[batchId] = groupId;

  return { batchId, assignmentIds: created.map((assignment) => assignment.id) };
}

export async function createGroupAssignment(request: GroupAssignmentRequest): Promise<CreatedBatch> {
  if (mocks.assignments) return mockBatch(request);

  const { data } = await api.post<AssignmentBatchDto>(
    `${CARD_API_URL}/learning-groups/${request.groupId}/scenario-assignments`,
    request.body,
  );

  return { batchId: data.id, assignmentIds: data.assignments.map((assignment) => assignment.id) };
}
