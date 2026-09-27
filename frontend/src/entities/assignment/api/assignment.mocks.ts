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

export const assignmentMocks: ScenarioAssignmentDto[] = [
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
    ...assignment("e4a6c8d0-2f5b-4d9e-9a3c-5b7d9f1b3e68", "2d4f6b8c-0e1a-4c3e-9b5d-7f9b1d3f5a74", "ASSIGNED"),
    assignment_batch_id: "6d8f0b2c-4e6a-4b9d-9f1c-3d5f7b9d1f2a",
    group_id: "3c8f0d52-6b4e-4a97-8f2c-8d5b3e9a7f14",
    group_name: "УМЦ-112, группа 7",
    scenario_id: "d1f3b5c7-9e2a-4d4f-8b6c-8e0a2c4e6f57",
    scenario_name: "ДТП с пострадавшими на МКАД",
    workspace_mode: "SHARED",
    launch_policy: "TEACHER_START",
    available_from: "2026-09-27T10:00:00+03:00",
    due_at: "2026-09-28T18:00:00+03:00",
    created_at: "2026-09-26T08:15:00+03:00",
  },
];
