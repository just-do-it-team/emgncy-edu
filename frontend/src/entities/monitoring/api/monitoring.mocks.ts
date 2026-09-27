import type { TeacherMonitoringSessionDto } from "@/shared/api";

const MINUTE_MS = 60 * 1000;
const now = Date.now();
const at = (minutesAgo: number) => new Date(now - minutesAgo * MINUTE_MS).toISOString();

const assignmentByParticipant: Record<string, string> = {
  "0b1d3f5a-7c9e-4b2d-8f4a-6c8e0a2b4d63": "b1d3f5a7-9c2e-4a6b-8d0f-2e4a6c8e0b35",
  "2d4f6b8c-0e1a-4c3e-9b5d-7f9b1d3f5a74": "c2e4a6b8-0d3f-4b7c-9e1a-3f5b7d9f1c46",
  "4f6b8d0a-2c4e-4a6b-8d0f-6b8d0f2a4c85": "f5b7d9e1-3a5c-4e0f-8b4d-6c8e0a2c4f79",
};

function session(
  fields: Pick<
    TeacherMonitoringSessionDto,
    "session_id" | "status" | "attempt_number" | "started_at" | "completed_at" | "score" | "passed"
  > & { participant: TeacherMonitoringSessionDto["participants"][number] },
): TeacherMonitoringSessionDto {
  const { participant, ...rest } = fields;

  return {
    assignment_id: assignmentByParticipant[participant.user_id] ?? "b1d3f5a7-9c2e-4a6b-8d0f-2e4a6c8e0b35",
    assignment_batch_id: "5c7e9a1b-3d5f-4a8c-8e0a-2c4e6a8c0e19",
    group_id: "2b7e9c41-5a3d-4f86-9e1b-7c4a2d8f6e03",
    group_name: "УМЦ-112, группа 4",
    scenario_id: "c0e2a4b6-8d1f-4c3e-9a5b-7d9f1b3d5e46",
    scenario_name: "Задымление в жилом доме",
    workspace_id: "f3d5b7a9-2c4e-4a6b-9d8f-0e1c3a5b7d92",
    cards_total: 1,
    cards_pending: 0,
    cards_emitted: 1,
    calls_total: 1,
    calls_pending: 0,
    calls_ringing: 0,
    calls_active: 0,
    calls_completed: 1,
    pending_card_keys: [],
    emitted_card_keys: ["call-smoke-leninsky"],
    successful_actions: 9,
    rejected_actions: 1,
    last_activity_at: rest.completed_at ?? rest.started_at,
    participants: [participant],
    ...rest,
  };
}

export const monitoringSessionsMock: TeacherMonitoringSessionDto[] = [
  session({
    session_id: "3e5a7c9b-1d3f-4b5a-8c7e-9f1b3d5a7c20",
    status: "RUNNING",
    attempt_number: 2,
    started_at: at(12),
    completed_at: null,
    score: null,
    passed: null,
    participant: {
      user_id: "2d4f6b8c-0e1a-4c3e-9b5d-7f9b1d3f5a74",
      display_name: "Орлов Дмитрий Игоревич",
      status: "RUNNING",
      position_code: null,
      participant_role: "OPERATOR_112",
    },
  }),
  session({
    session_id: "e2c4a6f8-1b3d-4f5a-8c7e-9d0b2f4a6c81",
    status: "COMPLETED",
    attempt_number: 1,
    started_at: at(95),
    completed_at: at(92),
    score: "50.00",
    passed: false,
    participant: {
      user_id: "0b1d3f5a-7c9e-4b2d-8f4a-6c8e0a2b4d63",
      display_name: "Ковалёва Анна Сергеевна",
      status: "COMPLETED",
      position_code: null,
      participant_role: "OPERATOR_112",
    },
  }),
  session({
    session_id: "9a1c3e5b-7d2f-4b6a-8c0e-4f6b8d0a2c97",
    status: "ABORTED",
    attempt_number: 2,
    started_at: at(44),
    completed_at: at(42),
    score: "41.94",
    passed: null,
    participant: {
      user_id: "0b1d3f5a-7c9e-4b2d-8f4a-6c8e0a2b4d63",
      display_name: "Ковалёва Анна Сергеевна",
      status: "COMPLETED",
      position_code: null,
      participant_role: "OPERATOR_112",
    },
  }),
  session({
    session_id: "7b9d1f3a-5c7e-4a9b-8d1f-3a5c7e9b1d42",
    status: "COMPLETED",
    attempt_number: 1,
    started_at: at(160),
    completed_at: at(156),
    score: "71.43",
    passed: false,
    participant: {
      user_id: "2d4f6b8c-0e1a-4c3e-9b5d-7f9b1d3f5a74",
      display_name: "Орлов Дмитрий Игоревич",
      status: "RUNNING",
      position_code: null,
      participant_role: "OPERATOR_112",
    },
  }),
  session({
    session_id: "8c0e2a4b-6d8f-4b0c-9e2a-4b6d8f0a2c53",
    status: "COMPLETED",
    attempt_number: 1,
    started_at: at(130),
    completed_at: at(126),
    score: "85.71",
    passed: true,
    participant: {
      user_id: "4f6b8d0a-2c4e-4a6b-8d0f-6b8d0f2a4c85",
      display_name: "Белова Ксения Андреевна",
      status: "COMPLETED",
      position_code: null,
      participant_role: "OPERATOR_112",
    },
  }),
];
