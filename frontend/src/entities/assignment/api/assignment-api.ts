import {
  api,
  RequestError,
  toTeacherAssignment,
  type AssignmentBatchDto,
  type AssignmentCreateDto,
  type ScenarioAssignmentDto,
  type ScenarioWorkspaceMode,
  type TeacherAssignment,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import type { AssignmentFilters } from "./assignment.keys";
import { assignmentWindow } from "../model/assignment-window";
import { scheduleTargetPath, type ScheduleBody, type ScheduleTarget } from "../model/lesson-schedule";
import { assignmentMocks } from "./assignment.mocks";

export async function fetchAssignments(
  { assignedBy }: AssignmentFilters,
  signal?: AbortSignal,
): Promise<TeacherAssignment[]> {
  if (mocks.assignments) return assignmentMocks.map(toTeacherAssignment);

  const { data } = await api.get<ScenarioAssignmentDto[]>(`${CARD_API_URL}/scenario-assignments`, {
    params: { assigned_by: assignedBy },
    signal,
  });

  return data.map(toTeacherAssignment);
}

interface AssignedScenario {
  name: string;
  revision: number;
  passingScore: number;
  workspaceMode: ScenarioWorkspaceMode;
}

export interface GroupAssignmentRequest {
  group: { id: string; name: string };
  body: AssignmentCreateDto;
  scenario: AssignedScenario;
}

export interface DirectAssignmentRequest {
  body: AssignmentCreateDto;
  scenario: AssignedScenario;
}

export interface CreatedBatch {
  batchId: string;
  assignmentIds: string[];
}

const VALIDATION = 422;

function mockAssignments(
  body: AssignmentCreateDto,
  scenario: AssignedScenario,
  batch: { id: string; group: { id: string; name: string } } | null,
  participantSets: string[][],
): ScenarioAssignmentDto[] {
  const positions = body.participant_ids.map((id) => body.participant_positions[id] ?? null).filter(Boolean);

  if (new Set(positions).size !== positions.length) {
    throw new RequestError(VALIDATION, "Only one participant may occupy each DDS position");
  }

  const createdAt = new Date().toISOString();
  const span = assignmentWindow(body.available_from, body.due_at, Date.parse(createdAt));
  const created = participantSets.map(
    (participantIds): ScenarioAssignmentDto => ({
      id: crypto.randomUUID(),
      scenario_id: body.scenario_id,
      scenario_name: scenario.name,
      scenario_revision: scenario.revision,
      passing_score: scenario.passingScore.toFixed(2),
      assignment_batch_id: batch?.id ?? null,
      group_id: batch?.group.id ?? null,
      group_name: batch?.group.name ?? null,
      assigned_by: body.assigned_by,
      workspace_mode: scenario.workspaceMode,
      launch_policy: body.launch_policy,
      max_attempts: body.max_attempts,
      status: "ASSIGNED",
      available_from: new Date(span.start).toISOString(),
      due_at: new Date(span.due).toISOString(),
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

  return created;
}

function mockBatch({ group, body, scenario }: GroupAssignmentRequest): CreatedBatch {
  const participantSets =
    scenario.workspaceMode === "INDIVIDUAL" ? body.participant_ids.map((id) => [id]) : [body.participant_ids];
  const batchId = crypto.randomUUID();
  const created = mockAssignments(body, scenario, { id: batchId, group }, participantSets);

  return { batchId, assignmentIds: created.map((assignment) => assignment.id) };
}

export async function createGroupAssignment(request: GroupAssignmentRequest): Promise<CreatedBatch> {
  if (mocks.assignments) return mockBatch(request);

  const { data } = await api.post<AssignmentBatchDto>(
    `${CARD_API_URL}/learning-groups/${request.group.id}/scenario-assignments`,
    request.body,
  );

  return { batchId: data.id, assignmentIds: data.assignments.map((assignment) => assignment.id) };
}

/** Назначение без группы: сервер создаёт одно занятие без партии, перенос и отмена идут по его идентификатору. */
export async function createDirectAssignment({ body, scenario }: DirectAssignmentRequest): Promise<string> {
  if (mocks.assignments) {
    const [created] = mockAssignments(body, scenario, null, [body.participant_ids]);

    return created?.id ?? "";
  }

  const { data } = await api.post<ScenarioAssignmentDto>(`${CARD_API_URL}/scenario-assignments`, body);

  return data.id;
}

export interface RescheduleRequest {
  target: ScheduleTarget;
  body: ScheduleBody;
}

const CONFLICT = 409;

function mockTargetAssignments(target: ScheduleTarget): ScenarioAssignmentDto[] {
  const found = assignmentMocks.filter((assignment) =>
    target.kind === "batch" ? assignment.assignment_batch_id === target.id : assignment.id === target.id,
  );

  if (found.some((assignment) => assignment.status !== "ASSIGNED" && assignment.status !== "EXPIRED")) {
    throw new RequestError(CONFLICT, "Only an unstarted assignment can be changed");
  }

  return found;
}

export async function rescheduleLesson({ target, body }: RescheduleRequest): Promise<void> {
  if (mocks.assignments) {
    mockTargetAssignments(target).forEach((assignment) =>
      Object.assign(assignment, { available_from: body.available_from, due_at: body.due_at, status: "ASSIGNED" }),
    );
    return;
  }

  await api.patch(`${CARD_API_URL}${scheduleTargetPath(target)}`, body);
}

export async function cancelLesson(target: ScheduleTarget): Promise<void> {
  if (mocks.assignments) {
    mockTargetAssignments(target).forEach((assignment) => Object.assign(assignment, { status: "CANCELLED" }));
    return;
  }

  await api.delete(`${CARD_API_URL}${scheduleTargetPath(target)}`);
}
