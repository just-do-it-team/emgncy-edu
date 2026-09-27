import type { IncomingCallTemplateDto, JsonObject, TrainingScenarioDetailDto } from "@/shared/api";

const teacherId = "6a8c0e2b-4d6f-4a1c-9e3b-5d7f9b1d3f28";
const otherTeacherId = "9d1f3b5a-7c2e-4a8d-9b6f-2e4a6c8e0d17";

const smokeCallTemplateId = "71a3c5e7-9b2d-4f46-8a1c-3e5a7c9e1b62";
const chuteCallTemplateId = "82b4d6f8-0c3e-4a57-9b2d-4f6a8c0e2d73";

const fireService = { service_id: "3f8a1c5e-7b2d-4a96-8e0f-5c7a9e1b3d4f", code: "101", name: "Пожарная охрана" };
const ambulanceService = {
  service_id: "4a9b2d6f-8c3e-4ba7-9f1a-6d8b0f2c4e5a",
  code: "103",
  name: "Скорая медицинская помощь",
};

const smokeClassification = {
  record_id: 1050102,
  group_code: 1,
  feature_1_code: 5,
  feature_2_code: 1,
  feature_3_code: 2,
  final_incident_type: "задымление: квартира",
  routing_flags: { threat: true },
  excluded_service_codes: [],
};

const smokeExpectedCard: JsonObject = {
  classification: smokeClassification,
  description:
    "Задымление в квартире на 7 этаже, дым из-под двери. В квартире может находиться пожилая женщина, на стук не открывает.",
  questionnaire: null,
  applicant_full_name: "Сидорова Анна Викторовна",
  automatic_phone_number: "+79161263471",
  provided_phone_number: "+79161263471",
  location_phone_number: null,
  reported_address: "г. Москва, Ленинский проспект, д. 14, подъезд 2, этаж 7, кв. 58",
  incident_address: "г. Москва, Ленинский проспект, д. 14, подъезд 2, этаж 7, кв. 58",
  victims_count: 1,
  current_status: "REGISTERED",
  services: ["101", "103"],
  service_statuses: { "101": "ADDED", "103": "ADDED" },
};

const chuteClassification = {
  record_id: 1050602,
  group_code: 1,
  feature_1_code: 5,
  feature_2_code: 6,
  feature_3_code: 2,
  final_incident_type: "задымление: мусоропровод",
  routing_flags: {},
  excluded_service_codes: [],
};

const chuteExpectedCard: JsonObject = {
  classification: chuteClassification,
  description:
    "Задымление мусоропровода в жилом доме, 17 этажей, заявитель на 7 этаже. Открытого пламени не видит, пострадавших нет.",
  questionnaire: null,
  applicant_full_name: "Ким Олег Юрьевич",
  automatic_phone_number: "+79161263471",
  provided_phone_number: null,
  location_phone_number: null,
  reported_address: "г. Москва, ул. Берзарина, д. 21, корп. 1, подъезд 3, домофон 68",
  incident_address: "г. Москва, ул. Берзарина, д. 21, корп. 1, подъезд 3",
  victims_count: 0,
  current_status: "REGISTERED",
  services: ["101"],
  service_statuses: { "101": "ADDED" },
};

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
  reported_address: "г. Москва, Ленинский проспект, д. 14, подъезд 2, этаж 5, кв. 58",
  incident_address: "г. Москва, Ленинский проспект, д. 14, подъезд 2, этаж 5, кв. 58",
  victims_count: 0,
};

const gasSmellExpectedCard: JsonObject = {
  ...gasSmellCard,
  current_status: "REGISTERED",
  services: ["104", "101"],
  service_statuses: { "104": "ACCEPTED", "101": "REJECTED" },
};

const gasSmellExpectedResult: JsonObject = {
  card: gasSmellExpectedCard,
  service_status_history: {
    "104": [{ status: "RECEIVED" }, { status: "ACCEPTED", comment: "Бригада направлена", unit_number: "12" }],
    "101": [
      { status: "RECEIVED" },
      { status: "REJECTED", comment: "Не по компетенции: признаков возгорания нет, запах газа — служба 104" },
    ],
  },
  outbound_call: {
    expected_text: "Запах газа в кв. 58, дверь открыта, пострадавших нет, жильцы подъезда предупреждены",
    minimum_similarity: 0.8,
  },
};

export const incomingCallTemplateMocks: IncomingCallTemplateDto[] = [
  {
    id: smokeCallTemplateId,
    template_key: "5e7a9c1b-3d5f-4b8a-9c2e-6f8a0c2e4b91",
    version: 2,
    name: "Задымление в квартире, Ленинский проспект",
    description: null,
    difficulty: 2,
    initial_call: {
      initial_utterance: "Алло, у соседей дым из-под двери, там бабушка живёт!",
      automatic_phone_number: "+79161263471",
    },
    expected_result: { card: smokeExpectedCard, outbound_call: null, service_status_history: null },
    is_active: true,
    created_by: teacherId,
    created_at: "2026-09-17T15:40:00+03:00",
  },
  {
    id: chuteCallTemplateId,
    template_key: "6f8b0d2c-4e6a-4c9b-8d3f-7a9c1e3b5d02",
    version: 1,
    name: "Задымление мусоропровода, ул. Берзарина",
    description: null,
    difficulty: 1,
    initial_call: {
      initial_utterance: "Здравствуйте, в подъезде дым из мусоропровода, весь этаж в дыму.",
      automatic_phone_number: "+79161263471",
    },
    expected_result: { card: chuteExpectedCard, outbound_call: null, service_status_history: null },
    is_active: true,
    created_by: otherTeacherId,
    created_at: "2026-09-15T10:05:00+03:00",
  },
];

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
      schema_version: 2,
      mode: "STATIC",
      cards: [
        {
          key: "call-smoke-leninsky",
          item_type: "INCOMING_CALL",
          trigger_type: "TIME_OFFSET",
          trigger_config: { offset_seconds: 10 },
          source_type: "TEMPLATE",
          template_id: smokeCallTemplateId,
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
          expected_result: gasSmellExpectedResult,
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
        template_id: smokeCallTemplateId,
        template_name: "Задымление в квартире, Ленинский проспект",
        initial_card: null,
        expected_card: smokeExpectedCard,
        classification: smokeClassification,
        main_service: { ...fireService, is_main: true },
        notification_list: [
          { ...fireService, is_main: true },
          { ...ambulanceService, is_main: false },
        ],
      },
      {
        key: "card-gas-smell",
        item_type: "INCIDENT_CARD",
        source_type: "INLINE",
        template_id: null,
        template_name: null,
        initial_card: gasSmellCard,
        expected_card: gasSmellExpectedCard,
        classification: gasSmellClassification,
        main_service: { service_id: null, code: "104", name: "Аварийная газовая служба", is_main: true },
        notification_list: [
          { service_id: null, code: "104", name: "Аварийная газовая служба", is_main: true },
          { ...fireService, is_main: false },
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
  {
    id: "e2a4c6d8-0f3b-4e5a-9c7d-1f3b5d7f9a68",
    name: "Задымление мусоропровода, билет 2",
    description: "Первый вызов билета 2: задымление мусоропровода в 17-этажном доме, пострадавших нет.",
    difficulty: 1,
    estimated_duration_seconds: 300,
    cards_count: 1,
    workspace_mode: "INDIVIDUAL",
    completion_policy: "STUDENT_CONFIRM",
    min_participants: 1,
    max_participants: 1,
    definition: {
      schema_version: 2,
      mode: "STATIC",
      cards: [
        {
          key: "call-chute-berzarina",
          item_type: "INCOMING_CALL",
          trigger_type: "TIME_OFFSET",
          trigger_config: { offset_seconds: 0 },
          source_type: "TEMPLATE",
          template_id: chuteCallTemplateId,
        },
      ],
    },
    revision: 3,
    status: "PUBLISHED",
    created_by: otherTeacherId,
    updated_by: otherTeacherId,
    created_at: "2026-09-15T10:20:00+03:00",
    updated_at: "2026-09-16T09:12:00+03:00",
    items: [
      {
        key: "call-chute-berzarina",
        item_type: "INCOMING_CALL",
        source_type: "TEMPLATE",
        template_id: chuteCallTemplateId,
        template_name: "Задымление мусоропровода, ул. Берзарина",
        initial_card: null,
        expected_card: chuteExpectedCard,
        classification: chuteClassification,
        main_service: { ...fireService, is_main: true },
        notification_list: [{ ...fireService, is_main: true }],
      },
    ],
  },
  {
    id: "f3b5d7e9-1a4c-4f6b-8d8e-2a4c6e8a0b79",
    name: "Задымление в квартире, первая версия",
    description: "Устаревшая версия сценария без карточки ДДС.",
    difficulty: 5,
    estimated_duration_seconds: 420,
    cards_count: 1,
    workspace_mode: "INDIVIDUAL",
    completion_policy: "STUDENT_CONFIRM",
    min_participants: 1,
    max_participants: 1,
    definition: {
      schema_version: 2,
      mode: "STATIC",
      cards: [
        {
          key: "call-smoke-leninsky",
          item_type: "INCOMING_CALL",
          trigger_type: "TIME_OFFSET",
          trigger_config: { offset_seconds: 15 },
          source_type: "TEMPLATE",
          template_id: smokeCallTemplateId,
        },
      ],
    },
    revision: 4,
    status: "ARCHIVED",
    created_by: teacherId,
    updated_by: teacherId,
    created_at: "2026-09-10T12:00:00+03:00",
    updated_at: "2026-09-18T11:25:00+03:00",
    items: [
      {
        key: "call-smoke-leninsky",
        item_type: "INCOMING_CALL",
        source_type: "TEMPLATE",
        template_id: smokeCallTemplateId,
        template_name: "Задымление в квартире, Ленинский проспект",
        initial_card: null,
        expected_card: smokeExpectedCard,
        classification: smokeClassification,
        main_service: { ...fireService, is_main: true },
        notification_list: [
          { ...fireService, is_main: true },
          { ...ambulanceService, is_main: false },
        ],
      },
    ],
  },
];
