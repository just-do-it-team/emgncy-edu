import type { AssignmentParticipantStatus, ScenarioAssignmentDto } from "@/shared/api";

const teacherId = "6a8c0e2b-4d6f-4a1c-9e3b-5d7f9b1d3f28";

function assignment(
  id: string,
  userId: string,
  status: AssignmentParticipantStatus,
): ScenarioAssignmentDto {
  return {
    id,
    scenario_id: "c0e2a4b6-8d1f-4c3e-9a5b-7d9f1b3d5e46",
    scenario_name: "Задымление в жилом доме",
    scenario_revision: 2,
    passing_score: "100.00",
    assignment_batch_id: "5c7e9a1b-3d5f-4a8c-8e0a-2c4e6a8c0e19",
    group_id: "2b7e9c41-5a3d-4f86-9e1b-7c4a2d8f6e03",
    group_name: "УМЦ-112, группа 4",
    assigned_by: teacherId,
    workspace_mode: "INDIVIDUAL",
    launch_policy: "STUDENT_SELF_START",
    max_attempts: 3,
    status,
    available_from: "2026-09-26T09:00:00+03:00",
    due_at: "2026-09-27T18:00:00+03:00",
    created_at: "2026-09-25T17:10:00+03:00",
    participants: [
      {
        user_id: userId,
        status,
        position_code: null,
        participant_role: "OPERATOR_112",
        ready_at: status === "ASSIGNED" ? null : "2026-09-26T21:05:00+03:00",
        completed_at: status === "COMPLETED" ? "2026-09-27T00:40:00+03:00" : null,
      },
    ],
  };
}

const HOUR_MS = 60 * 60 * 1000;
const hoursFromNow = (hours: number) => new Date(Date.now() + hours * HOUR_MS).toISOString();

function dispatcherAssignment(id: string, userId: string, status: AssignmentParticipantStatus): ScenarioAssignmentDto {
  const base = assignment(id, userId, status);

  return {
    ...base,
    scenario_id: "e1a3c5e7-9b2d-4f6a-8c0e-2d4f6b8d0a73",
    scenario_name: "Пожар в жилом доме — ДДС 101",
    scenario_revision: 1,
    assignment_batch_id: "7e9a1b3c-5d7f-4b9a-8c1e-3f5a7c9e1b62",
    max_attempts: 1,
    available_from: hoursFromNow(-1),
    due_at: hoursFromNow(3),
    created_at: hoursFromNow(-2),
    participants: base.participants.map((participant) => ({
      ...participant,
      position_code: "101",
      participant_role: "DDS",
    })),
  };
}

export const assignmentMocks: ScenarioAssignmentDto[] = [
  dispatcherAssignment("c7e9a1b3-5d7f-4a2c-9e4b-6d8f0a2c4e81", "4f6b8d0a-2c4e-4a6b-8d0f-6b8d0f2a4c85", "RUNNING"),
  dispatcherAssignment("d8f0a2c4-6e8a-4b3d-8f5c-7e9a1b3d5f92", "1a3c5e7b-9d2f-4c6a-8e0b-2d4f6a8c0e91", "RUNNING"),
  dispatcherAssignment("e9a1b3c5-7f0b-4c4e-9a6d-8f0b2d4f6a03", "2d4f6b8c-0e1a-4c3e-9b5d-7f9b1d3f5a74", "RUNNING"),
  dispatcherAssignment("f0b2c4d6-8a1c-4d5f-8b7e-0a2c4e6a8b14", "0b1d3f5a-7c9e-4b2d-8f4a-6c8e0a2b4d63", "COMPLETED"),
  dispatcherAssignment("a2c4e6f8-0b3d-4e7a-9c9f-2b4d6f8a0c24", "8b0d2f4a-6c8e-4a1b-9d3f-5a7c9e1b3d64", "COMPLETED"),
  dispatcherAssignment("b3d5f7a9-1c4e-4f8b-9d0a-3c5e7a9c1e35", "9c1e3a5b-7d9f-4b2c-8e4a-6b8d0f2a4c75", "ASSIGNED"),
  assignment("b1d3f5a7-9c2e-4a6b-8d0f-2e4a6c8e0b35", "0b1d3f5a-7c9e-4b2d-8f4a-6c8e0a2b4d63", "COMPLETED"),
  assignment("c2e4a6b8-0d3f-4b7c-9e1a-3f5b7d9f1c46", "2d4f6b8c-0e1a-4c3e-9b5d-7f9b1d3f5a74", "RUNNING"),
  assignment("f5b7d9e1-3a5c-4e0f-8b4d-6c8e0a2c4f79", "4f6b8d0a-2c4e-4a6b-8d0f-6b8d0f2a4c85", "COMPLETED"),
  assignment("a6c8e0f2-4b6d-4f1a-9c5e-7d9f1b3d5a80", "1a3c5e7b-9d2f-4c6a-8e0b-2d4f6a8c0e91", "ASSIGNED"),
  {
    ...assignment("d3f5b7c9-1e4a-4c8d-8f2b-4a6c8e0a2d57", "0b1d3f5a-7c9e-4b2d-8f4a-6c8e0a2b4d63", "COMPLETED"),
    assignment_batch_id: null,
    group_id: null,
    group_name: null,
    scenario_id: "d1f3b5c7-9e2a-4d4f-8b6c-8e0a2c4e6f57",
    scenario_name: "ДТП с пострадавшими на МКАД",
    available_from: null,
    due_at: null,
    created_at: "2026-09-19T10:30:00+03:00",
  },
  {
    ...assignment("e4a6c8d0-2f5b-4d9e-9a3c-5b7d9f1b3e68", "2d4f6b8c-0e1a-4c3e-9b5d-7f9b1d3f5a74", "RUNNING"),
    assignment_batch_id: "6d8f0b2c-4e6a-4b9d-9f1c-3d5f7b9d1f2a",
    group_id: "3c8f0d52-6b4e-4a97-8f2c-8d5b3e9a7f14",
    group_name: "УМЦ-112, группа 7",
    scenario_id: "d1f3b5c7-9e2a-4d4f-8b6c-8e0a2c4e6f57",
    scenario_name: "ДТП с пострадавшими на МКАД",
    workspace_mode: "SHARED",
    launch_policy: "TEACHER_START",
    available_from: hoursFromNow(-1),
    due_at: hoursFromNow(4),
    created_at: "2026-09-26T08:15:00+03:00",
    participants: ["101", "103"].map((positionCode, index) => ({
      user_id: index === 0 ? "2d4f6b8c-0e1a-4c3e-9b5d-7f9b1d3f5a74" : "1a3c5e7b-9d2f-4c6a-8e0b-2d4f6a8c0e91",
      status: "RUNNING",
      position_code: positionCode,
      participant_role: "DDS",
      ready_at: hoursFromNow(-0.1),
      completed_at: null,
    })),
  },
];
