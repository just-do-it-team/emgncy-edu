import type { CardTimelineDto } from "@/shared/api";

const fireCardServiceId = "c7a1e3f5-9b2d-4e46-8a0c-1d3f5b7e9a2c";
const ambulanceCardServiceId = "d8b2f4a6-0c3e-4f57-9b1d-2e4a6c8f0b3d";

export const cardTimelineMock: CardTimelineDto = {
  utterances_offset_base: "2026-09-22T10:14:07+03:00",
  events: [
    { offset_ms: 34200, kind: "CARD_OPENED" },
    {
      offset_ms: 57800,
      kind: "FIELD_SET",
      path: "incident_address",
      value: "г. Москва, Ленинский проспект, д. 41, подъезд 2, этаж 7, кв. 58",
      previous: null,
    },
    {
      offset_ms: 64900,
      kind: "FIELD_SET",
      path: "victims_count",
      value: 1,
      previous: 0,
    },
    {
      offset_ms: 68800,
      kind: "SERVICE_ADDED",
      service_id: "3f8a1c5e-7b2d-4a96-8e0f-5c7a9e1b3d4f",
      card_service_id: fireCardServiceId,
    },
    {
      offset_ms: 69500,
      kind: "SERVICE_ADDED",
      service_id: "4a9b2d6f-8c3e-4ba7-9f1a-6d8b0f2c4e5a",
      card_service_id: ambulanceCardServiceId,
    },
    {
      offset_ms: 88200,
      kind: "FIELD_SET",
      path: "description",
      value:
        "Задымление в квартире на 7 этаже, дым из-под двери. В квартире может находиться пожилая женщина, на стук не открывает. Жильцы эвакуируются самостоятельно.",
      previous: null,
    },
    {
      offset_ms: 112400,
      kind: "STATUS_CHANGED",
      card_service_id: fireCardServiceId,
      from: "ADDED",
      to: "RECEIVED",
      comment: null,
    },
    {
      offset_ms: 118700,
      kind: "STATUS_CHANGED",
      card_service_id: ambulanceCardServiceId,
      from: "ADDED",
      to: "RECEIVED",
      comment: null,
    },
    {
      offset_ms: 151300,
      kind: "DECISION",
      card_service_id: fireCardServiceId,
      decision: "ACCEPTED",
      comment: null,
    },
  ],
};
