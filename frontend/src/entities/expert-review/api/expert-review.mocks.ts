import type {
  DiscrepancyDto,
  JsonObject,
  TrainingActionDto,
  ExpertReviewContextDto,
  ScenarioAssignmentDto,
  TrainingSessionDto,
} from "@/shared/api";

const sessionId = "e2c4a6f8-1b3d-4f5a-8c7e-9d0b2f4a6c81";
const assignmentId = "b1d3f5a7-9c2e-4a6b-8d0f-2e4a6c8e0b35";
const workspaceId = "f3d5b7a9-2c4e-4a6b-9d8f-0e1c3a5b7d92";
const studentId = "0b1d3f5a-7c9e-4b2d-8f4a-6c8e0a2b4d63";
const teacherId = "6a8c0e2b-4d6f-4a1c-9e3b-5d7f9b1d3f28";
const callId = "7c4e2a91-5b38-4f06-9d17-2e8a6c3f1b54";
const cardId = "5e7a9c1b-3d5f-4a8c-9e0b-2d4f6a8c0e17";

const expectedAddress = "г. Москва, Ленинский проспект, д. 14, подъезд 2, этаж 7, кв. 58";
const enteredAddress = "г. Москва, Ленинский проспект, д. 41, подъезд 2, этаж 7, кв. 58";

const fireServiceId = "3f8a1c5e-7b2d-4a96-8e0f-5c7a9e1b3d4f";
const ambulanceServiceId = "4a9b2d6f-8c3e-4ba7-9f1a-6d8b0f2c4e5a";

const description =
  "Задымление в квартире на 7 этаже, дым из-под двери. В квартире может находиться пожилая женщина, на стук не открывает. Жильцы эвакуируются самостоятельно.";

const emptyCard: JsonObject = {
  card_number: "112-20260922-4F7A21C9D0",
  event_type_id: null,
  classification: null,
  description: null,
  questionnaire: null,
  applicant_full_name: null,
  automatic_phone_number: "+74957304512",
  provided_phone_number: null,
  location_phone_number: null,
  reported_address: null,
  incident_address: null,
  victims_count: 0,
  current_status: "REGISTERED",
  version: 1,
};

const withAddress: JsonObject = {
  ...emptyCard,
  reported_address: enteredAddress,
  incident_address: enteredAddress,
  version: 2,
};

const withVictim: JsonObject = { ...withAddress, victims_count: 1, version: 3 };

const withDescription: JsonObject = { ...withVictim, description, version: 7 };

function action(
  id: string,
  occurredAt: string,
  actionType: string,
  fields: Partial<TrainingActionDto>,
): TrainingActionDto {
  return {
    id,
    training_session_id: sessionId,
    workspace_id: workspaceId,
    actor_user_id: studentId,
    incident_card_id: cardId,
    action_type: actionType,
    entity_type: "incident_card",
    entity_id: cardId,
    occurred_at: occurredAt,
    result: "SUCCESS",
    before_state: null,
    after_state: null,
    details: {},
    ...fields,
  };
}

const actions: TrainingActionDto[] = [
  action("91a3c5e7-0b2d-4f46-8a1c-3e5a7c9e1b01", "2026-09-22T10:14:03.400+03:00", "INCOMING_CALL_RINGING", {
    actor_user_id: null,
    incident_card_id: null,
    entity_type: "training_call",
    entity_id: "7c4e2a91-5b38-4f06-9d17-2e8a6c3f1b54",
  }),
  action("91a3c5e7-0b2d-4f46-8a1c-3e5a7c9e1b02", "2026-09-22T10:14:07+03:00", "INCOMING_CALL_ANSWERED", {
    incident_card_id: null,
    entity_type: "training_call",
    entity_id: "7c4e2a91-5b38-4f06-9d17-2e8a6c3f1b54",
  }),
  action("91a3c5e7-0b2d-4f46-8a1c-3e5a7c9e1b03", "2026-09-22T10:14:08.300+03:00", "INCIDENT_CARD_CREATED_FROM_CALL", {
    after_state: emptyCard,
  }),
  action("91a3c5e7-0b2d-4f46-8a1c-3e5a7c9e1b04", "2026-09-22T10:15:04.800+03:00", "CARD_UPDATED", {
    before_state: emptyCard,
    after_state: withAddress,
    details: { changed_fields: ["incident_address", "reported_address"] },
  }),
  action("91a3c5e7-0b2d-4f46-8a1c-3e5a7c9e1b05", "2026-09-22T10:15:11.900+03:00", "CARD_UPDATED", {
    before_state: withAddress,
    after_state: withVictim,
    details: { changed_fields: ["victims_count"] },
  }),
  action("91a3c5e7-0b2d-4f46-8a1c-3e5a7c9e1b06", "2026-09-22T10:15:15.800+03:00", "CARD_SERVICE_ADDED", {
    entity_type: "card_service",
    entity_id: "c7a1e3f5-9b2d-4e46-8a0c-1d3f5b7e9a2c",
    after_state: {
      card_service_id: "c7a1e3f5-9b2d-4e46-8a0c-1d3f5b7e9a2c",
      service_id: fireServiceId,
      added_reason: "MANUAL",
      status: "ADDED",
    },
  }),
  action("91a3c5e7-0b2d-4f46-8a1c-3e5a7c9e1b07", "2026-09-22T10:15:16.500+03:00", "CARD_SERVICE_ADDED", {
    entity_type: "card_service",
    entity_id: "d8b2f4a6-0c3e-4f57-9b1d-2e4a6c8f0b3d",
    after_state: {
      card_service_id: "d8b2f4a6-0c3e-4f57-9b1d-2e4a6c8f0b3d",
      service_id: ambulanceServiceId,
      added_reason: "MANUAL",
      status: "ADDED",
    },
  }),
  action("91a3c5e7-0b2d-4f46-8a1c-3e5a7c9e1b08", "2026-09-22T10:15:22.100+03:00", "CARD_UPDATED", {
    result: "REJECTED",
    details: {
      error: "Card version conflict: expected 3, actual 5",
      attempted_actor_id: studentId,
    },
  }),
  action("91a3c5e7-0b2d-4f46-8a1c-3e5a7c9e1b09", "2026-09-22T10:15:35.200+03:00", "CARD_UPDATED", {
    before_state: { ...withVictim, version: 5 },
    after_state: withDescription,
    details: { changed_fields: ["description", "victims_count"] },
  }),
  action("91a3c5e7-0b2d-4f46-8a1c-3e5a7c9e1b10", "2026-09-22T10:15:45+03:00", "INCOMING_CALL_COMPLETED", {
    entity_type: "training_call",
    entity_id: "7c4e2a91-5b38-4f06-9d17-2e8a6c3f1b54",
  }),
];

const discrepancies: DiscrepancyDto[] = [
  {
    path: "card.reported_address",
    expected: expectedAddress,
    actual: enteredAddress,
    reason: "value_mismatch",
  },
  {
    path: "card.incident_address",
    expected: expectedAddress,
    actual: enteredAddress,
    reason: "value_mismatch",
  },
  {
    path: "card.description",
    expected:
      "Задымление в квартире на 7 этаже, дым из-под двери. В квартире может находиться пожилая женщина, на стук не открывает. Жильцы эвакуируются самостоятельно.",
    actual:
      "задымление в квартире на 7 этаже дым из-под двери. в квартире может находиться пожилая женщина на стук не открывает. жильцы эвакуируются самостоятельно",
    reason: "value_mismatch",
  },
  {
    path: "card.victims_count",
    expected: 2,
    actual: 1,
    reason: "value_mismatch",
  },
  {
    path: "card.classification.feature_2_code",
    expected: "02.01.03",
    actual: "02.01.01",
    reason: "value_mismatch",
  },
];

export const reviewSessionMock: TrainingSessionDto = {
  id: sessionId,
  assignment_id: assignmentId,
  attempt_number: 1,
  status: "COMPLETED",
  completion_policy: "STUDENT_CONFIRM",
  completion_state: {},
  completion_state_revision: 3,
  ready_to_complete_at: "2026-09-22T10:16:02+03:00",
  completed_automatically: false,
  started_at: "2026-09-22T10:13:40+03:00",
  completed_at: "2026-09-22T10:16:10+03:00",
  score: "50.00",
  passed: false,
  result: {
    cards: [],
    incoming_calls: [
      {
        scenario_item_key: "call-smoke-leninsky",
        training_call_id: callId,
        incident_card_id: cardId,
        score: "50.00",
        passed: false,
        discrepancies,
      },
    ],
  },
  expert_score: null,
  expert_passed: null,
  expert_comment: null,
  expert_evaluated_by: null,
  expert_evaluated_at: null,
};

export const expertReviewContextMock: ExpertReviewContextDto = {
  session: reviewSessionMock,
  scenario_snapshot: {
    name: "Задымление в жилом доме",
    difficulty: "BASIC",
    workspace_mode: "INDIVIDUAL",
    completion_policy: "STUDENT_CONFIRM",
  },
  participant_ids: [studentId],
  cards: [],
  incoming_calls: [
    {
      scenario_item_key: "call-smoke-leninsky",
      training_call_id: callId,
      incident_card_id: cardId,
      status: "COMPLETED",
      ringing_at: "2026-09-22T10:14:03.400+03:00",
      answered_at: "2026-09-22T10:14:07+03:00",
      completed_at: "2026-09-22T10:15:45+03:00",
      expected_result: {
        card: {
          reported_address: expectedAddress,
          incident_address: expectedAddress,
          victims_count: 2,
        },
      },
      current_state: {
        reported_address: enteredAddress,
        incident_address: enteredAddress,
        victims_count: 1,
      },
      automatic_result: {
        scenario_item_key: "call-smoke-leninsky",
        training_call_id: callId,
        incident_card_id: cardId,
        score: 50,
        passed: false,
        discrepancies,
      },
    },
  ],
  call_utterances: [],
  actions,
};

export const reviewAssignmentMock: ScenarioAssignmentDto = {
  id: assignmentId,
  scenario_id: "c0e2a4b6-8d1f-4c3e-9a5b-7d9f1b3d5e46",
  scenario_name: "Задымление в жилом доме",
  scenario_revision: 2,
  assignment_batch_id: null,
  assigned_by: teacherId,
  workspace_mode: "INDIVIDUAL",
  launch_policy: "STUDENT_SELF_START",
  max_attempts: 3,
  status: "COMPLETED",
  available_from: "2026-09-22T09:00:00+03:00",
  due_at: "2026-09-24T18:00:00+03:00",
  created_at: "2026-09-21T16:42:18+03:00",
  participants: [
    {
      user_id: studentId,
      status: "COMPLETED",
      position_code: null,
      participant_role: "OPERATOR_112",
      ready_at: "2026-09-22T10:13:31+03:00",
      completed_at: "2026-09-22T10:16:10+03:00",
    },
  ],
};
