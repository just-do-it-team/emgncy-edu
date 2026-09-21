import type { Scenario, ScenarioListItem } from "../model/scenario";

const fire101 = { service_id: "3f8a1c20-4d11-4a7e-9c31-6b2f0d5e8a10", name: "Служба 101", is_main: true };
const police102 = { service_id: "5c2d7e41-9a03-4f62-8b17-1e4a9c3d7f52", name: "Служба 102", is_main: false };
const ambulance103 = { service_id: "7e4b9d63-2c85-4d19-9a44-3f6b1e8c2d74", name: "Служба 103", is_main: true };
const cemp = { service_id: "1b8e3a07-5f41-4c9d-9e68-7a0d5c2f6b18", name: "ЦЭМП", is_main: false };
const codd = { service_id: "2d9f5c29-8b63-4e17-9f72-9c2e7a4d8f30", name: "ЦОДД", is_main: false };
const utilities = { service_id: "4a1b7e43-6d95-4f28-8a13-2e5c9b7d1a42", name: "Деп. ЖКХ", is_main: false };
const lifts = { service_id: "6c3d9a65-4f17-4b82-9d35-8b7e1c3f5a64", name: "Мослифт", is_main: false };

export const scenarioMocks: Scenario[] = [
  {
    scenario_id: "e2a9c541-7b38-4d95-8f16-3c7e1a5d9b40",
    revision: 3,
    name: "Задымление мусоропровода в жилом доме",
    mode: "ARM112",
    status: "PUBLISHED",
    difficulty: 2,
    weight: 1,
    fill_norm_seconds: 180,
    incident_type_name: "задымление: мусоропровод",
    ekp35_incident_type: "пожар: мусоропровод",
    features: [
      { level: 1, group: "Где произошло", feature_id: 1105, code: "FIRE_HOUSE", name: "жилой дом" },
      { level: 2, group: "Место возгорания", feature_id: 1206, code: "FIRE_CHUTE", name: "мусоропровод" },
      { level: 3, group: "Что наблюдается", feature_id: 1402, code: "FIRE_SMOKE", name: "дым" },
    ],
    main_service: fire101,
    notification_list: [fire101, utilities, lifts],
    used_in_lessons: 2,
  },
  {
    scenario_id: "f3b0d652-8c49-4e16-9a27-4d8f2b6e0c51",
    revision: 2,
    name: "Отравление лекарственными препаратами",
    mode: "ARM112",
    status: "PUBLISHED",
    difficulty: 3,
    weight: 1.2,
    fill_norm_seconds: 180,
    incident_type_name: "Отравление",
    ekp35_incident_type: "Отравление",
    features: [
      { level: 1, group: "Что случилось", feature_id: 2102, code: "MED_POISONING", name: "Отравление" },
    ],
    main_service: ambulance103,
    notification_list: [ambulance103, cemp],
    used_in_lessons: 1,
  },
  {
    scenario_id: "a4c1e763-9d50-4f27-8b38-5e9a3c7f1d62",
    revision: 1,
    name: "Задымление в торговом центре",
    mode: "ARM112",
    status: "PUBLISHED",
    difficulty: 4,
    weight: 1.4,
    fill_norm_seconds: 180,
    incident_type_name: "задымление: общественное место",
    ekp35_incident_type: "пожар: гостиница",
    features: [
      { level: 1, group: "Где произошло", feature_id: 1106, code: "FIRE_OBJECT", name: "объект" },
      { level: 2, group: "Тип объекта", feature_id: 1304, code: "FIRE_PUBLIC_PLACE", name: "общестенное место" },
      { level: 3, group: "Что наблюдается", feature_id: 1402, code: "FIRE_SMOKE", name: "дым" },
    ],
    main_service: fire101,
    notification_list: [fire101, police102, cemp],
    used_in_lessons: 1,
  },
  {
    scenario_id: "b5d2f874-0e61-4a38-9c49-6f0b4d8a2e73",
    revision: 4,
    name: "ДТП с пострадавшими на съезде с МКАД",
    mode: "DDS",
    status: "PUBLISHED",
    difficulty: 4,
    weight: 1.5,
    fill_norm_seconds: 180,
    incident_type_name: "ДТП с пострадавшими - легковой",
    ekp35_incident_type: "ДТП с пострадавшими, ДТП: легковой транспорт",
    features: [
      { level: 1, group: "Что произошло", feature_id: 3102, code: "TRAFFIC_VICTIMS", name: "ДТП пострадавшие" },
      { level: 2, group: "Участники", feature_id: 3201, code: "TRAFFIC_CAR", name: "Транспорт легковой" },
    ],
    main_service: police102,
    notification_list: [police102, fire101, ambulance103, codd],
    used_in_lessons: 1,
  },
  {
    scenario_id: "c6e3a985-1f72-4b49-8d50-7a1c5e9f3b84",
    revision: 2,
    name: "Пожар на балконе жилого дома",
    mode: "ARM112",
    status: "PUBLISHED",
    difficulty: 3,
    weight: 1.2,
    fill_norm_seconds: 180,
    incident_type_name: "пожар: балкон",
    ekp35_incident_type: "пожар: балкон",
    features: [
      { level: 1, group: "Где произошло", feature_id: 1105, code: "FIRE_HOUSE", name: "жилой дом" },
      { level: 2, group: "Место возгорания", feature_id: 1202, code: "FIRE_BALCONY", name: "балкон" },
      { level: 3, group: "Что наблюдается", feature_id: 1401, code: "FIRE_OPEN_FLAME", name: "открытое пламя" },
    ],
    main_service: fire101,
    notification_list: [fire101, police102, cemp, utilities],
    used_in_lessons: 2,
  },
];

export const scenarioListMocks: ScenarioListItem[] = scenarioMocks.map((scenario) => ({
  scenario_id: scenario.scenario_id,
  name: scenario.name,
  incident_type_name: scenario.incident_type_name,
  difficulty: scenario.difficulty,
  weight: scenario.weight,
  fill_norm_seconds: scenario.fill_norm_seconds,
  used_in_lessons: scenario.used_in_lessons,
  status: scenario.status,
}));
