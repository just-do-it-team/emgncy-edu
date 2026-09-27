import type { TrainingScenarioDetailDto } from "@/shared/api";

const teacherId = "6a8c0e2b-4d6f-4a1c-9e3b-5d7f9b1d3f28";

const gasSmellClassification = {
  record_id: 13020201,
  group_code: 13,
  feature_1_code: 2,
  feature_2_code: 2,
  feature_3_code: 1,
  final_incident_type: "Запах бытового газа в квартире",
  routing_flags: {},
  excluded_service_codes: [],
};

const gasSmellCard = {
  classification: gasSmellClassification,
  description:
    "Соседка из кв. 61 сообщает о сильном запахе газа на лестничной площадке 5 этажа, источник — кв. 58, дверь открыта.",
  applicant_full_name: "Кравцова Нина Петровна",
  automatic_phone_number: "+74957304518",
  provided_phone_number: "+79161234507",
  location_phone_number: null,
  reported_address: "г. Москва, Ленинский проспект, д. 14, подъезд 2, этаж 5, кв. 58",
  incident_address: "г. Москва, Ленинский проспект, д. 14, подъезд 2, этаж 5, кв. 58",
  victims_count: 0,
};

export const scenarioDetailMocks: TrainingScenarioDetailDto[] = [
  {
    id: "c0e2a4b6-8d1f-4c3e-9a5b-7d9f1b3d5e46",
    name: "Задымление в жилом доме",
    description: "Входящий звонок о задымлении квартиры, в квартире может находиться пожилая женщина.",
    difficulty: 2,
    estimated_duration_seconds: 600,
    cards_count: 2,
    workspace_mode: "INDIVIDUAL",
    completion_policy: "STUDENT_CONFIRM",
    min_participants: 1,
    max_participants: 1,
    definition: {
      schema_version: 1,
      mode: "STATIC",
      cards: [
        {
          key: "call-smoke-leninsky",
          item_type: "INCOMING_CALL",
          trigger_type: "TIME_OFFSET",
          trigger_config: { offset_seconds: 10 },
          source_type: "TEMPLATE",
          template_id: "71a3c5e7-9b2d-4f46-8a1c-3e5a7c9e1b62",
        },
        {
          key: "card-gas-smell",
          item_type: "INCIDENT_CARD",
          trigger_type: "AFTER_ACTION",
          trigger_config: {
            card_key: "call-smoke-leninsky",
            action_type: "INCOMING_CALL_COMPLETED",
            delay_seconds: 45,
          },
          source_type: "INLINE",
          initial_card: gasSmellCard,
          expected_result: {
            card: {
              ...gasSmellCard,
              current_status: "REGISTERED",
              services: ["104", "101"],
              service_statuses: { "104": "ADDED", "101": "ADDED" },
            },
          },
        },
      ],
    },
    revision: 2,
    status: "PUBLISHED",
    created_by: teacherId,
    updated_by: teacherId,
    created_at: "2026-09-18T11:20:00+03:00",
    updated_at: "2026-09-21T16:05:00+03:00",
    items: [
      {
        key: "call-smoke-leninsky",
        item_type: "INCOMING_CALL",
        source_type: "TEMPLATE",
        template_id: "71a3c5e7-9b2d-4f46-8a1c-3e5a7c9e1b62",
        template_name: "Задымление в квартире, Ленинский проспект",
        initial_card: null,
        expected_card: null,
        classification: {
          record_id: 1050102,
          group_code: 1,
          feature_1_code: 5,
          feature_2_code: 1,
          feature_3_code: 2,
          final_incident_type: "задымление: квартира",
          routing_flags: { threat_to_people: true },
          excluded_service_codes: [],
        },
        main_service: { service_id: "3f8a1c5e-7b2d-4a96-8e0f-5c7a9e1b3d4f", code: "101", name: "Пожарная охрана", is_main: true },
        notification_list: [
          { service_id: "3f8a1c5e-7b2d-4a96-8e0f-5c7a9e1b3d4f", code: "101", name: "Пожарная охрана", is_main: true },
          { service_id: "4a9b2d6f-8c3e-4ba7-9f1a-6d8b0f2c4e5a", code: "103", name: "Скорая медицинская помощь", is_main: false },
        ],
      },
      {
        key: "card-gas-smell",
        item_type: "INCIDENT_CARD",
        source_type: "INLINE",
        template_id: null,
        template_name: null,
        initial_card: gasSmellCard,
        expected_card: {
          ...gasSmellCard,
          current_status: "REGISTERED",
          services: ["104", "101"],
          service_statuses: { "104": "ADDED", "101": "ADDED" },
        },
        classification: gasSmellClassification,
        main_service: { service_id: null, code: "104", name: "Аварийная газовая служба", is_main: true },
        notification_list: [
          { service_id: null, code: "104", name: "Аварийная газовая служба", is_main: true },
          { service_id: "3f8a1c5e-7b2d-4a96-8e0f-5c7a9e1b3d4f", code: "101", name: "Пожарная охрана", is_main: false },
        ],
      },
    ],
  },
  {
    id: "d1f3b5c7-9e2a-4d4f-8b6c-8e0a2c4e6f57",
    name: "ДТП с пострадавшими на МКАД",
    description: null,
    difficulty: 3,
    estimated_duration_seconds: 900,
    cards_count: 6,
    workspace_mode: "SHARED",
    completion_policy: "TEACHER_ONLY",
    min_participants: 2,
    max_participants: 4,
    definition: {
      schema_version: 3,
      mode: "PROCEDURAL",
      cards: [],
      procedural_generation: {
        key: "procedural-cards",
        target_count: 6,
        template_pool: { classification_group_codes: [3] },
      },
    },
    revision: 1,
    status: "DRAFT",
    created_by: teacherId,
    updated_by: teacherId,
    created_at: "2026-09-24T09:40:00+03:00",
    updated_at: "2026-09-24T09:40:00+03:00",
    items: [],
  },
];
