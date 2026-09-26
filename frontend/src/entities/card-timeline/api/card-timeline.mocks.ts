import type { JsonObject, TrainingActionDto } from "@/shared/api";

const sessionId = "e2c4a6f8-1b3d-4f5a-8c7e-9d0b2f4a6c81";
const workspaceId = "f3d5b7a9-2c4e-4a6b-9d8f-0e1c3a5b7d92";
const studentId = "0b1d3f5a-7c9e-4b2d-8f4a-6c8e0a2b4d63";
const cardId = "5e7a9c1b-3d5f-4a8c-9e0b-2d4f6a8c0e17";
const fireServiceId = "3f8a1c5e-7b2d-4a96-8e0f-5c7a9e1b3d4f";
const ambulanceServiceId = "4a9b2d6f-8c3e-4ba7-9f1a-6d8b0f2c4e5a";

const addressAsEntered = "г. Москва, Ленинский проспект, д. 41, подъезд 2, этаж 7, кв. 58";
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
  reported_address: addressAsEntered,
  incident_address: addressAsEntered,
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

export const trainingActionsMock: TrainingActionDto[] = [
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
