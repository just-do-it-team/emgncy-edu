import type { Attempt } from "../model/attempt";
import type { AttemptSummary } from "../model/attempt-summary";
import type { Arm112Card, DdsCard } from "../model/incident-card";
import type {
  QuestionnaireGroup,
  QuestionnaireOption,
  SelectedFeature,
} from "../model/references";

const FILL_NORM_SECONDS = 180;
const ACK_NORM_SECONDS = 30;

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

function moscowIso(time: number): string {
  return `${new Date(time + MOSCOW_OFFSET_MS).toISOString().slice(0, 19)}+03:00`;
}

function daysAgoAt(days: number, hours: number, minutes: number, seconds: number): string {
  const moscowNow = new Date(Date.now() + MOSCOW_OFFSET_MS);

  return moscowIso(
    Date.UTC(
      moscowNow.getUTCFullYear(),
      moscowNow.getUTCMonth(),
      moscowNow.getUTCDate() - days,
      hours,
      minutes,
      seconds,
    ) - MOSCOW_OFFSET_MS,
  );
}

function at(startedAt: string, offsetSeconds: number): string {
  const time = new Date(startedAt).getTime() + offsetSeconds * 1000 + MOSCOW_OFFSET_MS;

  return `${new Date(time).toISOString().slice(0, 19)}+03:00`;
}

const services = {
  fire: { service_id: "3f8a1c20-4d11-4a7e-9c31-6b2f0d5e8a10", name: "Служба 101" },
  police: { service_id: "5c2d7e41-9a03-4f62-8b17-1e4a9c3d7f52", name: "Служба 102" },
  ambulance: { service_id: "7e4b9d63-2c85-4d19-9a44-3f6b1e8c2d74", name: "Служба 103" },
  cemp: { service_id: "1b8e3a07-5f41-4c9d-9e68-7a0d5c2f6b18", name: "ЦЭМП" },
  codd: { service_id: "2d9f5c29-8b63-4e17-9f72-9c2e7a4d8f30", name: "ЦОДД" },
  utilities: { service_id: "4a1b7e43-6d95-4f28-8a13-2e5c9b7d1a42", name: "Деп. ЖКХ" },
  lifts: { service_id: "6c3d9a65-4f17-4b82-9d35-8b7e1c3f5a64", name: "Мослифт" },
} as const;

const channels = {
  mts: { channel_id: "a7f2c318-6b94-4e51-8d27-3c9a1f5e7b40", name: "МТС" },
  megafon: { channel_id: "c9d4e53a-8f16-4a73-9b48-5e1c3a7f9d62", name: "Мегафон" },
  beeline: { channel_id: "e1f6a75c-2d38-4c95-8f69-7a3e5c9b1f84", name: "Билайн" },
  tele2: { channel_id: "f3a8c97e-4e52-4d17-9a81-9c5f7e1d3b06", name: "Теле2" },
} as const;

const eventTypes = {
  fire: { id: 1, code: "FIRE", name: "Пожар" },
  medical: { id: 3, code: "MEDICAL", name: "Оказание медицинской помощи" },
  traffic: { id: 5, code: "TRAFFIC", name: "Дорожно-транспортное происшествие" },
} as const;

const eventKinds = {
  fireHouse: { id: 11, code: "FIRE_HOUSE", name: "Пожар и задымление в жилом доме" },
  firePublic: { id: 14, code: "FIRE_OBJECT", name: "Пожар и задымление на объекте" },
  medicalHelp: { id: 31, code: "MEDICAL_HELP", name: "Скорая и неотложная помощь" },
  trafficVictims: { id: 52, code: "TRAFFIC_VICTIMS", name: "ДТП с пострадавшими" },
} as const;

const option = (feature_id: number, code: string, name: string) => ({ feature_id, code, name });

const fireWhere = [
  option(1101, "FIRE_STREET", "на улице"),
  option(1102, "FIRE_TRANSPORT", "транспорт"),
  option(1103, "FIRE_METRO", "метро"),
  option(1104, "FIRE_MCK", "МЦК"),
  option(1105, "FIRE_HOUSE", "жилой дом"),
  option(1106, "FIRE_OBJECT", "объект"),
];

const fireHouseObjects = [
  option(1201, "FIRE_FLAT", "квартира"),
  option(1202, "FIRE_BALCONY", "балкон"),
  option(1203, "FIRE_GAS_COLUMN", "газовая колонка"),
  option(1204, "FIRE_GAS_STOVE", "газовая плита"),
  option(1205, "FIRE_LIFT", "лифт"),
  option(1206, "FIRE_CHUTE", "мусоропровод"),
  option(1207, "FIRE_ENTRANCE", "подъезд"),
  option(1208, "FIRE_ALARM", "сигнализация"),
  option(1209, "FIRE_METER", "счетчик электричества"),
  option(1210, "FIRE_PRIVATE_HOUSE", "частный дом"),
  option(1211, "FIRE_WIRING", "электрическая проводка"),
  option(1212, "FIRE_SWITCHBOARD", "электрощит"),
  option(1213, "FIRE_STAIRWELL", "лестничная клетка"),
  option(1214, "FIRE_BASEMENT", "подвал"),
  option(1215, "FIRE_DACHA", "дача"),
  option(1216, "FIRE_OTHER_INDOOR", "прочие внутридомовые объекты"),
];

const firePublicObjects = [
  option(1301, "FIRE_EDUCATION", "учебное"),
  option(1302, "FIRE_MEDICAL", "лечебное"),
  option(1303, "FIRE_ADMIN", "административное"),
  option(1304, "FIRE_PUBLIC_PLACE", "общестенное место"),
  option(1305, "FIRE_HAZARDOUS", "опасный"),
  option(1306, "FIRE_GAS_PIPE", "газопровод"),
  option(1307, "FIRE_PRODUCTION", "производство"),
  option(1308, "FIRE_FUEL_STATION", "АЗС"),
  option(1309, "FIRE_OTHER_OBJECT", "прочие объекты"),
];

const fireSigns = [
  option(1401, "FIRE_OPEN_FLAME", "открытое пламя"),
  option(1402, "FIRE_SMOKE", "дым"),
  option(1403, "FIRE_BURNT_SMELL", "запах гари"),
];

const medicalConditions = [
  option(2101, "MED_UNCONSCIOUS", "Без сознания"),
  option(2102, "MED_POISONING", "Отравление"),
  option(2103, "MED_BAD", "Плохо"),
  option(2104, "MED_HEART", "Плохо с сердцем"),
  option(2105, "MED_SEIZURES", "Судороги"),
  option(2106, "MED_BLEEDING", "Кровотечение"),
  option(2107, "MED_TRAUMA", "Травма"),
  option(2108, "MED_BURN", "Ожог"),
  option(2109, "MED_BREATHING", "Задыхается"),
  option(2110, "MED_BIRTH", "Роды"),
];

const trafficKinds = [
  option(3101, "TRAFFIC_NO_VICTIMS", "ДТП"),
  option(3102, "TRAFFIC_VICTIMS", "ДТП пострадавшие"),
];

const trafficParticipants = [
  option(3201, "TRAFFIC_CAR", "Транспорт легковой"),
  option(3202, "TRAFFIC_PUBLIC", "Транспорт общественный"),
  option(3203, "TRAFFIC_SERVICE", "Транспорт служебный"),
  option(3204, "TRAFFIC_TRUCK", "Транспорт грузовой"),
  option(3205, "TRAFFIC_PEDESTRIAN", "Наезд на пешехода"),
  option(3206, "TRAFFIC_HIT_AND_RUN", "Автомашина скрылась"),
  option(3207, "TRAFFIC_DANGEROUS_CARGO", "Опасный груз"),
  option(3208, "TRAFFIC_FUEL_SPILL", "Разлив топлива"),
  option(3209, "TRAFFIC_BURNING", "Горит дымится"),
  option(3210, "TRAFFIC_OBSTACLE", "Наезд на препятствие"),
  option(3211, "TRAFFIC_BLOCKED", "Движение перекрыто"),
];

const fireHouseQuestionnaire: QuestionnaireGroup[] = [
  { group: "Где произошло", options: fireWhere },
  { group: "Место возгорания", options: fireHouseObjects },
  { group: "Что наблюдается", options: fireSigns },
];

const firePublicQuestionnaire: QuestionnaireGroup[] = [
  { group: "Где произошло", options: fireWhere },
  { group: "Тип объекта", options: firePublicObjects },
  { group: "Что наблюдается", options: fireSigns },
];

const medicalQuestionnaire: QuestionnaireGroup[] = [
  { group: "Что случилось", options: medicalConditions },
];

const trafficQuestionnaire: QuestionnaireGroup[] = [
  { group: "Что произошло", options: trafficKinds },
  { group: "Участники", options: trafficParticipants },
];

const feature = (level: 1 | 2 | 3, source: QuestionnaireOption): SelectedFeature => ({
  level,
  feature_id: source.feature_id,
  code: source.code,
  name: source.name,
});

const features = {
  fireHouse: feature(1, fireWhere[4]),
  fireObject: feature(1, fireWhere[5]),
  fireChute: feature(2, fireHouseObjects[5]),
  fireBalcony: feature(2, fireHouseObjects[1]),
  firePublicPlace: feature(2, firePublicObjects[3]),
  fireSmoke: feature(3, fireSigns[1]),
  fireOpenFlame: feature(3, fireSigns[0]),
  medicalPoisoning: feature(1, medicalConditions[1]),
  medicalBad: feature(1, medicalConditions[2]),
  trafficVictims: feature(1, trafficKinds[1]),
  trafficCar: feature(2, trafficParticipants[0]),
};

const smokeChuteType = {
  incident_type_id: "d5b1f307-4a92-4c68-9e35-8f2c6a1d7b53",
  name: "задымление: мусоропровод",
};

const berzarinaReference: Arm112Card = {
  mode: "ARM112",
  source_type: "CALL",
  external_card_id: null,
  channel: channels.mts,
  phones: { aon: "+79161263471", provided: "+79161263471", at_location: null, is_foreign: false },
  applicant: { full_name: "Ким Олег Юрьевич", status: "WITNESS" },
  address: {
    full: "Москва, ул. Берзарина, д. 21, корп. 1",
    country: "Россия",
    subject: "Москва",
    settlement: null,
    object: null,
    okrug: "Северо-Западный административный округ",
    district: "Щукино",
    street: "улица Берзарина",
    house: "21",
    building: "1",
    structure: null,
    apartment: null,
    entrance: "3",
    floor: "7",
    intercom_code: "68",
    descriptive: null,
    coordinates: { latitude: 55.79284, longitude: 37.4817 },
  },
  event_type: eventTypes.fire,
  event_kind: eventKinds.fireHouse,
  features: [features.fireHouse, features.fireChute, features.fireSmoke],
  final_incident_type: smokeChuteType,
  description:
    "Задымление мусоропровода в жилом доме, 17 этажей, заявитель на 7 этаже, открытого пламени нет, пострадавших нет.",
  victims_count: 0,
  services: [
    { ...services.fire, is_main: true, added_reason: "EKP" },
    { ...services.utilities, is_main: false, added_reason: "EKP" },
    { ...services.lifts, is_main: false, added_reason: "EKP" },
  ],
};

export const mockLessonId = "5d1f8a36-9c47-4e23-8b95-1a6d3f7c2e58";
export const runningLessonId = "8b3e5c72-1d94-4a68-9f37-4e2a7c5d9b16";
export const demoStudentId = "a8c1e6d5-9b27-4f50-8d86-4e5a7c2b9f34";

const cleanStartedAt = daysAgoAt(0, 10, 12, 4);

const cleanAttempt: Attempt = {
  attempt_id: "0a7c4e18-3b25-4f91-8d6a-2c5e9b1f7a34",
  lesson_id: "8b3e5c72-1d94-4a68-9f37-4e2a7c5d9b16",
  assignment_id: "8b3e5c72-1d94-4a68-9f37-4e2a7c5d9b16",
  attempt_number: 1,
  incident_card_number: "36814845",
  mode: "ARM112",
  student: {
    student_id: "c4e7a291-5f83-4b16-9d42-7a1c3e8f5b90",
    full_name: "Соколова Марина Игоревна",
    workstation_number: 4,
  },
  scenario: {
    scenario_id: "e2a9c541-7b38-4d95-8f16-3c7e1a5d9b40",
    revision: 3,
    name: "Задымление мусоропровода в жилом доме",
    difficulty: 2,
    reference_incident_type: smokeChuteType,
  },
  questionnaire: fireHouseQuestionnaire,
  started_at: cleanStartedAt,
  completed_at: at(cleanStartedAt, 143),
  timings: { fill: { actual_seconds: 143, norm_seconds: FILL_NORM_SECONDS } },
  score: {
    criteria: {
      C1: { weight: 0.25, value: 1, points: 25 },
      C2: { weight: 0.25, value: 1, points: 25 },
      C3: { weight: 0.15, value: 1, points: 15 },
      C4: { weight: 0.15, value: 1, points: 15 },
      C5: { weight: 0.1, value: 1, points: 10 },
      C6: { weight: 0.05, value: 0.6, points: 3 },
      C7: { weight: 0.05, value: 1, points: 5 },
    },
    total: 98,
    passed: true,
  },
  reference_card: berzarinaReference,
  submitted_card: {
    ...berzarinaReference,
    description:
      "Задымление мусоропровода в жилом доме, 17 этажей, заявитель на 7 этаже. Открытого пламени не видит, пострадавших нет.",
  },
  errors: [
    {
      error_id: "f1c8a350-2e97-4b64-9d18-5a3c7e2f9b41",
      kind: "SPELLING",
      criterion: "C6",
      severity: "MINOR",
      field: "description",
      expected: "открытого пламени нет",
      actual: "Открытого пламени не видит",
      explanation:
        "Формулировка передаёт наблюдение заявителя вместо факта. На реагирование не влияет, на качество карточки влияет.",
      action_id: "a3f7c194-8d52-4e16-9b73-2c6a1f5e8d94",
    },
  ],
  actions: [
    { action_id: "b5e2a836-1c47-4f93-8d25-6a9e3c7f1b58", occurred_at: at(cleanStartedAt, 0), type: "CALL_STARTED", phone: "+79161263471" },
    { action_id: "c7a4e158-3b96-4d21-9f48-8c2e5a9d3f70", occurred_at: at(cleanStartedAt, 2), type: "CARD_OPENED", incident_card_id: "9f3c7a25-6e18-4b94-8d51-3a7c2e6f9b45" },
    { action_id: "d9c6a370-5e28-4f15-8b63-1e4a7c2d9f86", occurred_at: at(cleanStartedAt, 18), type: "ADDRESS_ENTERED", field: "address.street", previous_value: null, value: "улица Берзарина" },
    { action_id: "e1a8c592-7f43-4b27-9d85-3c6e1a4f7b28", occurred_at: at(cleanStartedAt, 31), type: "ADDRESS_ENTERED", field: "address.house", previous_value: null, value: "21" },
    { action_id: "f3c1a714-9b65-4d39-8f27-5a8c3e6d1f40", occurred_at: at(cleanStartedAt, 44), type: "FEATURE_SELECTED", feature: features.fireHouse },
    { action_id: "a5e3c936-2d87-4f51-9b49-7c1e5a8f3d62", occurred_at: at(cleanStartedAt, 58), type: "FEATURE_SELECTED", feature: features.fireChute },
    { action_id: "b7c5e158-4f29-4a73-8d61-9e3a7c1f5b84", occurred_at: at(cleanStartedAt, 72), type: "FEATURE_SELECTED", feature: features.fireSmoke },
    { action_id: "c9a7e370-6b41-4d95-9f83-1a5c9e3f7d06", occurred_at: at(cleanStartedAt, 89), type: "SERVICE_ADDED", service: services.fire, added_reason: "EKP" },
    { action_id: "a3f7c194-8d52-4e16-9b73-2c6a1f5e8d94", occurred_at: at(cleanStartedAt, 118), type: "FIELD_CHANGED", field: "description", previous_value: null, value: "Задымление мусоропровода в жилом доме, 17 этажей, заявитель на 7 этаже. Открытого пламени не видит, пострадавших нет." },
    { action_id: "e7c3a916-2f58-4b14-9d76-5a1e3c7f9b20", occurred_at: at(cleanStartedAt, 138), type: "CALL_ENDED" },
    { action_id: "f9a1c538-4d76-4e92-8b15-7c3a5e1d9f42", occurred_at: at(cleanStartedAt, 143), type: "CARD_SAVED", incident_card_id: "9f3c7a25-6e18-4b94-8d51-3a7c2e6f9b45" },
  ],
  expert_review: null,
};

const poisoningType = {
  incident_type_id: "b8e4c159-7d23-4a96-9f41-2c7e5a1d8b36",
  name: "Отравление",
};

const kolomenskayaReference: Arm112Card = {
  mode: "ARM112",
  source_type: "CALL",
  external_card_id: null,
  channel: channels.megafon,
  phones: { aon: "+79168975623", provided: "+79168975623", at_location: null, is_foreign: false },
  applicant: { full_name: "Иванов Сергей Петрович", status: "RELATIVE" },
  address: {
    full: "Москва, Коломенская наб., д. 18, кв. 142",
    country: "Россия",
    subject: "Москва",
    settlement: null,
    object: null,
    okrug: "Южный административный округ",
    district: "Нагатинский Затон",
    street: "Коломенская набережная",
    house: "18",
    building: null,
    structure: null,
    apartment: "142",
    entrance: "3",
    floor: "4",
    intercom_code: "142",
    descriptive: null,
    coordinates: { latitude: 55.67612, longitude: 37.67089 },
  },
  event_type: eventTypes.medical,
  event_kind: eventKinds.medicalHelp,
  features: [features.medicalPoisoning],
  final_incident_type: poisoningType,
  description:
    "Женщина 51 год приняла лекарственные препараты по ошибке, потеряла сознание. Вызывает супруг, находится рядом.",
  victims_count: 1,
  services: [
    { ...services.ambulance, is_main: true, added_reason: "EKP" },
    { ...services.cemp, is_main: false, added_reason: "EKP" },
  ],
};

const missedStartedAt = daysAgoAt(0, 11, 31, 47);

const missedMainServiceAttempt: Attempt = {
  attempt_id: "1b8d5f29-4c36-4a02-9e7b-3d6f0c2a8b45",
  lesson_id: "8b3e5c72-1d94-4a68-9f37-4e2a7c5d9b16",
  assignment_id: "9c4f6d83-2e05-4b79-8a48-5f3b8d6e0c27",
  attempt_number: 1,
  incident_card_number: "36814851",
  mode: "ARM112",
  student: {
    student_id: "d5f8b3a2-6e94-4c27-8a53-1b2d4f9e6c01",
    full_name: "Абрамов Кирилл Денисович",
    workstation_number: 7,
  },
  scenario: {
    scenario_id: "f3b0d652-8c49-4e16-9a27-4d8f2b6e0c51",
    revision: 2,
    name: "Отравление лекарственными препаратами, потеря сознания",
    difficulty: 3,
    reference_incident_type: poisoningType,
  },
  questionnaire: medicalQuestionnaire,
  started_at: missedStartedAt,
  completed_at: at(missedStartedAt, 164),
  timings: { fill: { actual_seconds: 164, norm_seconds: FILL_NORM_SECONDS } },
  score: {
    criteria: {
      C1: { weight: 0.25, value: 1, points: 25 },
      C2: { weight: 0.25, value: 0, points: 0 },
      C3: { weight: 0.15, value: 1, points: 15 },
      C4: { weight: 0.15, value: 1, points: 15 },
      C5: { weight: 0.1, value: 1, points: 10 },
      C6: { weight: 0.05, value: 1, points: 5 },
      C7: { weight: 0.05, value: 1, points: 5 },
    },
    total: 75,
    passed: false,
  },
  reference_card: kolomenskayaReference,
  submitted_card: {
    ...kolomenskayaReference,
    features: [features.medicalPoisoning],
    services: [{ ...services.cemp, is_main: false, added_reason: "MANUAL" }],
  },
  errors: [
    {
      error_id: "a2d9f461-5b37-4e08-9c16-7f4a2e8d5b93",
      kind: "MAIN_SERVICE_MISSED",
      criterion: "C2",
      severity: "CRITICAL",
      field: "services",
      expected: "Служба 103",
      actual: "ЦЭМП",
      explanation:
        "Признак «Отравление» выбран верно, но выведенная из него главная служба не оповещена: в списке осталась только ЦЭМП, добавленная вручную. Бригада скорой помощи не выехала бы, при потере сознания это прямая угроза жизни.",
      service: services.ambulance,
      ekp_feature: {
        feature_id: 3240,
        feature_name: "Отравление",
        consequence: "не оповещена Служба 103",
      },
      action_id: "c6b1e903-8d45-4f27-9a38-2e5c7f1b4d60",
    },
  ],
  actions: [
    { action_id: "d1f7c385-9b24-4a63-8e57-4c9a2d6f1e80", occurred_at: at(missedStartedAt, 0), type: "CALL_STARTED", phone: "+79168975623" },
    { action_id: "e3a9c517-1d68-4b95-9f24-6e1c5a9d3f72", occurred_at: at(missedStartedAt, 3), type: "CARD_OPENED", incident_card_id: "8d2f6c41-9a37-4e58-8b16-5c3a9f7e2d64" },
    { action_id: "f5c1a739-3e80-4d17-8a46-8c3e7a1f5b96", occurred_at: at(missedStartedAt, 21), type: "ADDRESS_ENTERED", field: "address.street", previous_value: null, value: "Коломенская набережная" },
    { action_id: "a7e3c951-5f42-4b39-9c68-1e5a9c3f7d18", occurred_at: at(missedStartedAt, 38), type: "ADDRESS_ENTERED", field: "address.apartment", previous_value: null, value: "142" },
    { action_id: "b8c5a127-3f96-4e41-9d72-6a1e3c8f5b04", occurred_at: at(missedStartedAt, 76), type: "FEATURE_SELECTED", feature: features.medicalPoisoning },
    { action_id: "c6b1e903-8d45-4f27-9a38-2e5c7f1b4d60", occurred_at: at(missedStartedAt, 98), type: "SERVICE_ADDED", service: services.cemp, added_reason: "MANUAL" },
    { action_id: "d8a3c165-2e97-4b53-9f71-4a6c8e2d0f52", occurred_at: at(missedStartedAt, 129), type: "FIELD_CHANGED", field: "description", previous_value: null, value: "Женщина 51 год приняла лекарственные препараты по ошибке, потеряла сознание. Вызывает супруг, находится рядом." },
    { action_id: "e0c5a387-4f19-4d75-8b93-6c8e0a4f2d74", occurred_at: at(missedStartedAt, 158), type: "CALL_ENDED" },
    { action_id: "f2e7c509-6a31-4f97-9d15-8e0c2a6f4b96", occurred_at: at(missedStartedAt, 164), type: "CARD_SAVED", incident_card_id: "8d2f6c41-9a37-4e58-8b16-5c3a9f7e2d64" },
  ],
  expert_review: null,
};

const mallSmokeType = {
  incident_type_id: "c7a2e831-5b46-4d09-8f27-1e6c3a9d5b74",
  name: "задымление: общественное место",
};

const kirovogradskayaReference: Arm112Card = {
  mode: "ARM112",
  source_type: "CALL",
  external_card_id: null,
  channel: channels.beeline,
  phones: { aon: "+79161239878", provided: "+79161239878", at_location: null, is_foreign: false },
  applicant: { full_name: "Ивлев Артём Олегович", status: "WITNESS" },
  address: {
    full: "Москва, ул. Кировоградская, д. 15, ТЦ «Электронный рай»",
    country: "Россия",
    subject: "Москва",
    settlement: null,
    object: "ТЦ «Электронный рай»",
    okrug: "Южный административный округ",
    district: "Чертаново Центральное",
    street: "Кировоградская улица",
    house: "15",
    building: null,
    structure: null,
    apartment: null,
    entrance: null,
    floor: "-1",
    intercom_code: null,
    descriptive: "ТЦ «Электронный рай», станция метро Пражская",
    coordinates: { latitude: 55.61237, longitude: 37.60415 },
  },
  event_type: eventTypes.fire,
  event_kind: eventKinds.firePublic,
  features: [features.fireObject, features.firePublicPlace, features.fireSmoke],
  final_incident_type: mallSmokeType,
  description:
    "Задымление на минус первом этаже торгового центра, источник не установлен, точной информации о пострадавших нет.",
  victims_count: null,
  services: [
    { ...services.fire, is_main: true, added_reason: "EKP" },
    { ...services.police, is_main: false, added_reason: "EKP" },
    { ...services.cemp, is_main: false, added_reason: "EKP" },
  ],
};

const slowStartedAt = daysAgoAt(1, 11, 4, 12);

const normExceededAttempt: Attempt = {
  attempt_id: "2c9e6a3b-5d47-4b13-8f28-4e7a1d3c9b56",
  lesson_id: "5d1f8a36-9c47-4e23-8b95-1a6d3f7c2e58",
  assignment_id: "0d5a7e94-3f16-4c80-9b59-6a4c9e7f1d38",
  attempt_number: 2,
  incident_card_number: "36814858",
  mode: "ARM112",
  student: {
    student_id: "e6a9c4b3-7f05-4d38-9b64-2c3e5a0f7d12",
    full_name: "Гуськова Полина Андреевна",
    workstation_number: 12,
  },
  scenario: {
    scenario_id: "a4c1e763-9d50-4f27-8b38-5e9a3c7f1d62",
    revision: 1,
    name: "Задымление в торговом центре",
    difficulty: 4,
    reference_incident_type: mallSmokeType,
  },
  questionnaire: firePublicQuestionnaire,
  started_at: slowStartedAt,
  completed_at: at(slowStartedAt, 247),
  timings: { fill: { actual_seconds: 247, norm_seconds: FILL_NORM_SECONDS } },
  score: {
    criteria: {
      C1: { weight: 0.25, value: 1, points: 25 },
      C2: { weight: 0.25, value: 1, points: 25 },
      C3: { weight: 0.15, value: 0.8, points: 12 },
      C4: { weight: 0.15, value: 1, points: 15 },
      C5: { weight: 0.1, value: 0, points: 0 },
      C6: { weight: 0.05, value: 1, points: 5 },
      C7: { weight: 0.05, value: 1, points: 5 },
    },
    total: 87,
    passed: true,
  },
  reference_card: kirovogradskayaReference,
  submitted_card: { ...kirovogradskayaReference, victims_count: null },
  errors: [
    {
      error_id: "c3f8a512-6d94-4e71-8b26-9a1c5e3f7d08",
      kind: "NORM_EXCEEDED",
      criterion: "C5",
      severity: "SIGNIFICANT",
      field: "timings.fill",
      expected: "180 с",
      actual: "247 с",
      explanation:
        "Норматив обработки превышен на 67 секунд. Задержка набрана на уточнении этажности и повторном вводе адреса: карточка ушла в службы позже нормативного срока.",
      stage: "FILL",
      norm_seconds: FILL_NORM_SECONDS,
      actual_seconds: 247,
      action_id: "b6d2f048-1a83-4c95-9e37-5f8b2d6a0c14",
    },
    {
      error_id: "d5a0c734-8f16-4b93-9d48-1c3e7a9f5b20",
      kind: "REQUIRED_FIELD_EMPTY",
      criterion: "C3",
      severity: "SIGNIFICANT",
      field: "victims_count",
      expected: "уточнить у заявителя",
      actual: null,
      explanation:
        "Количество пострадавших не уточнено и не отмечено как неизвестное. Служба 103 не может оценить наряд сил.",
      action_id: null,
    },
  ],
  actions: [
    { action_id: "e7c3a961-2d58-4f14-8a76-3e9c1a5f7d28", occurred_at: at(slowStartedAt, 0), type: "CALL_STARTED", phone: "+79161239878" },
    { action_id: "f9e5c183-4a70-4d36-9c98-5a1e3c7f9b40", occurred_at: at(slowStartedAt, 4), type: "CARD_OPENED", incident_card_id: "7c1e5a93-4d86-4f27-9b35-8e2a6c4f1d90" },
    { action_id: "a1c7e305-6b92-4f58-8d10-7c3a5e9f1b62", occurred_at: at(slowStartedAt, 29), type: "ADDRESS_ENTERED", field: "address.descriptive", previous_value: null, value: "метро Пражская, ТЦ Электронный рай" },
    { action_id: "b3e9c527-8d14-4a70-9f32-9e5c7a1f3d84", occurred_at: at(slowStartedAt, 96), type: "ADDRESS_ENTERED", field: "address.street", previous_value: null, value: "Кировоградская улица" },
    { action_id: "c5a1e749-0f36-4b92-8d54-1a7e9c3f5b06", occurred_at: at(slowStartedAt, 118), type: "ADDRESS_ENTERED", field: "address.house", previous_value: null, value: "15" },
    { action_id: "d7c3a961-2b58-4f14-9a76-3c9e1a5f7d28", occurred_at: at(slowStartedAt, 141), type: "FEATURE_SELECTED", feature: features.fireObject },
    { action_id: "e9a5c183-4d70-4b36-8c98-5e1a3c7f9b40", occurred_at: at(slowStartedAt, 160), type: "FEATURE_SELECTED", feature: features.firePublicPlace },
    { action_id: "f1c7e305-6f92-4d58-9b10-7a3c5e9f1b62", occurred_at: at(slowStartedAt, 178), type: "FEATURE_SELECTED", feature: features.fireSmoke },
    { action_id: "a3e9c527-8b14-4f70-8d32-9c5e7a1f3d84", occurred_at: at(slowStartedAt, 196), type: "SERVICE_ADDED", service: services.fire, added_reason: "EKP" },
    { action_id: "b6d2f048-1a83-4c95-9e37-5f8b2d6a0c14", occurred_at: at(slowStartedAt, 214), type: "FIELD_CHANGED", field: "description", previous_value: null, value: "Задымление на минус первом этаже торгового центра, источник не установлен, точной информации о пострадавших нет." },
    { action_id: "c8f4a260-3e95-4d17-8b49-7a1c3e5f9d26", occurred_at: at(slowStartedAt, 239), type: "CALL_ENDED" },
    { action_id: "d0a6c482-5f17-4b39-9d61-9c3e5a7f1b48", occurred_at: at(slowStartedAt, 247), type: "CARD_SAVED", incident_card_id: "7c1e5a93-4d86-4f27-9b35-8e2a6c4f1d90" },
  ],
  expert_review: null,
};

const trappedType = {
  incident_type_id: "e9c4a173-2f68-4b50-9d84-3a7e1c5f9b26",
  name: "ДТП с пострадавшими - легковой",
};

const mkadReference: DdsCard = {
  mode: "DDS",
  source_type: "VIS",
  external_card_id: "CODD-2026-0915-44817",
  channel: channels.tele2,
  phones: { aon: "+79168963254", provided: "+79168963254", at_location: null, is_foreign: false },
  applicant: { full_name: "Иванова Елена Сергеевна", status: "WITNESS" },
  address: {
    full: "Москва, съезд с МКАД (внутренняя сторона) на Симферопольское шоссе",
    country: "Россия",
    subject: "Москва",
    settlement: null,
    object: null,
    okrug: "Южный административный округ",
    district: "Чертаново Южное",
    street: "МКАД, 34-й километр",
    house: null,
    building: null,
    structure: null,
    apartment: null,
    entrance: null,
    floor: null,
    intercom_code: null,
    descriptive: "100 метров не доезжая до Симферопольского шоссе, обочина",
    coordinates: { latitude: 55.58419, longitude: 37.60682 },
  },
  event_type: eventTypes.traffic,
  event_kind: eventKinds.trafficVictims,
  features: [features.trafficVictims, features.trafficCar],
  final_incident_type: trappedType,
  description:
    "На автомобиль ВАЗ красного цвета упало бревно с грузовика, водитель заблокирован в салоне.",
  victims_count: 1,
  services: [
    { ...services.fire, is_main: true, added_reason: "EKP" },
    { ...services.ambulance, is_main: false, added_reason: "EKP" },
    { ...services.police, is_main: false, added_reason: "EKP" },
    { ...services.codd, is_main: false, added_reason: "VIS_UPDATE" },
  ],
  response_statuses: [
    { service_id: services.fire.service_id, status: "ACCEPTED", set_at: daysAgoAt(2, 11, 42, 18), comment: null },
    { service_id: services.ambulance.service_id, status: "ACCEPTED", set_at: daysAgoAt(2, 11, 42, 31), comment: null },
    { service_id: services.police.service_id, status: "ACCEPTED", set_at: daysAgoAt(2, 11, 42, 47), comment: null },
    { service_id: services.codd.service_id, status: "REJECTED", set_at: daysAgoAt(2, 11, 43, 5), comment: "Участок вне зоны ответственности, передано в ЦАФАП" },
  ],
};

const ddsStartedAt = daysAgoAt(2, 11, 41, 52);

const ddsStatusAttempt: Attempt = {
  attempt_id: "3d0f7b4c-6e58-4c24-9a39-5f8b2e4d0c67",
  lesson_id: "0d5a7e94-3f16-4c80-9b59-6a4c9e7f1d38",
  assignment_id: "1e6b8f05-4a27-4d91-8c60-7b5d0f8a2e49",
  attempt_number: 1,
  incident_card_number: "36814860",
  mode: "DDS",
  student: {
    student_id: "a8c1e6d5-9b27-4f50-8d86-4e5a7c2b9f34",
    full_name: "Верещагин Матвей Русланович",
    workstation_number: 3,
  },
  scenario: {
    scenario_id: "b5d2f874-0e61-4a38-9c49-6f0b4d8a2e73",
    revision: 4,
    name: "ДТП с зажатием на съезде с МКАД",
    difficulty: 4,
    reference_incident_type: trappedType,
  },
  questionnaire: trafficQuestionnaire,
  started_at: ddsStartedAt,
  completed_at: at(ddsStartedAt, 128),
  timings: {
    ack: { actual_seconds: 46, norm_seconds: ACK_NORM_SECONDS },
    fill: { actual_seconds: 128, norm_seconds: FILL_NORM_SECONDS },
  },
  score: {
    criteria: {
      C1: { weight: 0.2, value: 1, points: 20 },
      C2: { weight: 0.2, value: 1, points: 20 },
      C3: { weight: 0.1, value: 1, points: 10 },
      C4: { weight: 0.1, value: 1, points: 10 },
      C5: { weight: 0.1, value: 0, points: 0 },
      C6: { weight: 0.05, value: 1, points: 5 },
      C7: { weight: 0.25, value: 0.2, points: 5 },
    },
    total: 70,
    passed: false,
  },
  reference_card: mkadReference,
  submitted_card: {
    ...mkadReference,
    response_statuses: [
      { service_id: services.fire.service_id, status: "ACCEPTED", set_at: at(ddsStartedAt, 46), comment: null },
      { service_id: services.ambulance.service_id, status: "ACCEPTED", set_at: at(ddsStartedAt, 61), comment: null },
      { service_id: services.police.service_id, status: "ACCEPTED", set_at: at(ddsStartedAt, 78), comment: null },
      { service_id: services.codd.service_id, status: "REJECTED", set_at: at(ddsStartedAt, 94), comment: null },
      { service_id: services.fire.service_id, status: "ARRIVED", set_at: at(ddsStartedAt, 112), comment: null },
    ],
  },
  errors: [
    {
      error_id: "e5c1a927-3f84-4d60-9b17-2a6c8e4f0d93",
      kind: "STATUS_WITHOUT_COMMENT",
      criterion: "C7",
      severity: "CRITICAL",
      field: "response_statuses.ЦОДД",
      expected: "причина отказа",
      actual: null,
      explanation:
        "Статус «Не принята» выставлен без обязательного комментария. Причина отказа не зафиксирована, разобрать задержку реагирования по журналу невозможно.",
      service: services.codd,
      status: "REJECTED",
      action_id: "c2e8a604-5d19-4f73-8b46-9a0c2e6f4d18",
    },
    {
      error_id: "f7a3c149-5b06-4e82-9d39-4c8e0a6f2b15",
      kind: "STATUS_ORDER_VIOLATION",
      criterion: "C7",
      severity: "SIGNIFICANT",
      field: "response_statuses.Служба 101",
      expected: "Начало реагирования",
      actual: "Прибытие",
      explanation:
        "Из статуса «Принята» выставлено «Прибытие» в обход «Начала реагирования». Время выезда потеряно, норматив прибытия посчитать не по чему.",
      service: services.fire,
      status: "ARRIVED",
      previous_status: "ACCEPTED",
      action_id: "d4a0c826-7f31-4b95-9c58-1e2a4c8f6b30",
    },
    {
      error_id: "a9c5e361-7d28-4f04-8b51-6e0c2a8f4d37",
      kind: "NORM_EXCEEDED",
      criterion: "C5",
      severity: "SIGNIFICANT",
      field: "timings.ack",
      expected: "30 с",
      actual: "46 с",
      explanation:
        "Первичный статус по главной службе выставлен через 46 секунд при нормативе 30. Задержка подтверждения сдвигает весь график реагирования.",
      stage: "ACK",
      norm_seconds: ACK_NORM_SECONDS,
      actual_seconds: 46,
      action_id: "b0c6e482-9f53-4a17-8d70-3a4c6e0f8b52",
    },
  ],
  actions: [
    { action_id: "e6a2c840-1b75-4d39-9f92-5c6e8a0f2b74", occurred_at: at(ddsStartedAt, 0), type: "CARD_OPENED", incident_card_id: "6b0d4f82-3c75-4a16-9e24-7d1f5b3a0c89" },
    { action_id: "b0c6e482-9f53-4a17-8d70-3a4c6e0f8b52", occurred_at: at(ddsStartedAt, 46), type: "STATUS_SET", service: services.fire, status: "ACCEPTED", previous_status: "RECEIVED", comment: null },
    { action_id: "f8c4a062-1d97-4e58-9a13-5c7e9a1f3d46", occurred_at: at(ddsStartedAt, 61), type: "STATUS_SET", service: services.ambulance, status: "ACCEPTED", previous_status: "RECEIVED", comment: null },
    { action_id: "a0e6c284-3f19-4b70-8c35-7e9a1c3f5d68", occurred_at: at(ddsStartedAt, 78), type: "STATUS_SET", service: services.police, status: "ACCEPTED", previous_status: "RECEIVED", comment: null },
    { action_id: "c2e8a604-5d19-4f73-8b46-9a0c2e6f4d18", occurred_at: at(ddsStartedAt, 94), type: "STATUS_SET", service: services.codd, status: "REJECTED", previous_status: "RECEIVED", comment: null },
    { action_id: "d4a0c826-7f31-4b95-9c58-1e2a4c8f6b30", occurred_at: at(ddsStartedAt, 112), type: "STATUS_SET", service: services.fire, status: "ARRIVED", previous_status: "ACCEPTED", comment: null },
    { action_id: "e6c2a048-9b53-4d17-8f70-3c4e6a8f0b52", occurred_at: at(ddsStartedAt, 128), type: "CARD_SAVED", incident_card_id: "6b0d4f82-3c75-4a16-9e24-7d1f5b3a0c89" },
  ],
  expert_review: {
    reviewed_by: "b2c9e647-0f38-4a15-9d82-6c4a0e8f2b73",
    reviewed_by_name: "Селиверстова Ирина Львовна",
    reviewed_at: daysAgoAt(2, 14, 20, 36),
    previous_total: 70,
    total: 62,
    comment:
      "Снижено за статус «Не принята» без причины: на разборе занятия это ключевая ошибка, отдельно отмечено обучающемуся.",
  },
};

const apartmentFireType = {
  incident_type_id: "f0d5b284-3a79-4c61-8e95-4b8f2d6a0c37",
  name: "пожар: балкон",
};

const dubninskayaReference: Arm112Card = {
  mode: "ARM112",
  source_type: "CALL",
  external_card_id: null,
  channel: channels.mts,
  phones: { aon: "+79161263471", provided: "+79161263471", at_location: null, is_foreign: false },
  applicant: { full_name: "Сидорова Анна Викторовна", status: "WITNESS" },
  address: {
    full: "Москва, ул. Дубнинская, д. 21",
    country: "Россия",
    subject: "Москва",
    settlement: null,
    object: null,
    okrug: "Северный административный округ",
    district: "Восточное Дегунино",
    street: "Дубнинская улица",
    house: "21",
    building: null,
    structure: null,
    apartment: null,
    entrance: null,
    floor: "5",
    intercom_code: null,
    descriptive: "Горит балкон, наблюдают с улицы",
    coordinates: { latitude: 55.87913, longitude: 37.55247 },
  },
  event_type: eventTypes.fire,
  event_kind: eventKinds.fireHouse,
  features: [features.fireHouse, features.fireBalcony, features.fireOpenFlame],
  final_incident_type: apartmentFireType,
  description:
    "Горит балкон на 5 этаже, открытое пламя, пострадавших не видят, наблюдают с улицы. Дом не газифицирован.",
  victims_count: 0,
  services: [
    { ...services.fire, is_main: true, added_reason: "EKP" },
    { ...services.police, is_main: false, added_reason: "EKP" },
    { ...services.cemp, is_main: false, added_reason: "EKP" },
    { ...services.utilities, is_main: false, added_reason: "EKP" },
  ],
};

const toponymStartedAt = daysAgoAt(7, 12, 18, 33);

const toponymAttempt: Attempt = {
  attempt_id: "4e1a8c5d-7f69-4d35-8b40-6a9c3f5e1d78",
  lesson_id: "1e6b8f05-4a27-4d91-8c60-7b5d0f8a2e49",
  assignment_id: "2f7c9a16-5b38-4e02-9d71-8c6e1a9f3b50",
  attempt_number: 1,
  incident_card_number: "36814862",
  mode: "ARM112",
  student: {
    student_id: "a8c1e6d5-9b27-4f50-8d86-4e5a7c2b9f34",
    full_name: "Верещагин Матвей Русланович",
    workstation_number: 9,
  },
  scenario: {
    scenario_id: "c6e3a985-1f72-4b49-8d50-7a1c5e9f3b84",
    revision: 2,
    name: "Пожар на балконе жилого дома",
    difficulty: 3,
    reference_incident_type: apartmentFireType,
  },
  questionnaire: fireHouseQuestionnaire,
  started_at: toponymStartedAt,
  completed_at: at(toponymStartedAt, 167),
  timings: { fill: { actual_seconds: 167, norm_seconds: FILL_NORM_SECONDS } },
  score: {
    criteria: {
      C1: { weight: 0.25, value: 1, points: 25 },
      C2: { weight: 0.25, value: 1, points: 25 },
      C3: { weight: 0.15, value: 1, points: 15 },
      C4: { weight: 0.15, value: 0, points: 0 },
      C5: { weight: 0.1, value: 1, points: 10 },
      C6: { weight: 0.05, value: 0.6, points: 3 },
      C7: { weight: 0.05, value: 1, points: 5 },
    },
    total: 83,
    passed: false,
  },
  reference_card: dubninskayaReference,
  submitted_card: {
    ...dubninskayaReference,
    address: {
      ...dubninskayaReference.address,
      full: "Москва, ул. Дубининская, д. 12",
      okrug: "Центральный административный округ",
      district: "Замоскворечье",
      street: "Дубининская улица",
      house: "12",
      coordinates: { latitude: 55.72438, longitude: 37.63102 },
    },
    description:
      "Горит балкон на 5 этаже, открытое пламя, пострадавших не видят, наблюдают с улецы. Дом не газифицирован.",
  },
  errors: [
    {
      error_id: "b1d7f395-4a68-4c20-9e83-5f7a1c3e9d46",
      kind: "AMBIGUOUS_TOPONYM",
      criterion: "C4",
      severity: "CRITICAL",
      field: "address.street",
      expected: "Дубнинская улица, дом 21 (САО, Восточное Дегунино)",
      actual: "Дубининская улица, дом 21 (ЦАО, Замоскворечье)",
      explanation:
        "В Москве существуют обе улицы: Дубнинская в САО и Дубининская в ЦАО, дом 21 есть на каждой. Расчёт выехал бы в Замоскворечье вместо Восточного Дегунина, это около 20 километров и другой пожарный гарнизон. Заявитель назвал улицу, обучающийся выбрал первую подсказку из списка и не переспросил округ.",
      action_id: "d3f9a517-6c80-4e42-9a05-7b9c3e5f1d68",
    },
    {
      error_id: "c3e9a517-6d80-4f42-8a05-9b7c3e5f1d68",
      kind: "ADDRESS_MISMATCH",
      criterion: "C4",
      severity: "CRITICAL",
      field: "address.house",
      expected: "21",
      actual: "12",
      explanation:
        "Номер дома введён неверно. Дубнинская, 12 и Дубнинская, 21 — разные корпуса в глубине квартала, расчёт потерял бы время на поиск подъезда.",
      distance_meters: 180,
      action_id: "f7c3e951-0a24-4b86-9d49-1e3a5c7f9b02",
    },
    {
      error_id: "a5c1e739-2f68-4b04-9d83-7e5a1c3f9b46",
      kind: "SPELLING",
      criterion: "C6",
      severity: "MINOR",
      field: "description",
      expected: "с улицы",
      actual: "с улецы",
      explanation:
        "Опечатка в описании. На реагирование не влияет, на качество карточки влияет.",
      action_id: "f9e5c173-2a46-4b08-9f61-3c5a7e9f1b24",
    },
  ],
  actions: [
    { action_id: "c1e7a395-2d68-4b40-8f83-5a7c1e3f9d46", occurred_at: at(toponymStartedAt, 0), type: "CALL_STARTED", phone: "+79161263471" },
    { action_id: "e5a1c739-8f02-4d64-9b27-9c1e5a7f3b80", occurred_at: at(toponymStartedAt, 3), type: "CARD_OPENED", incident_card_id: "5a9c3e7f-1d64-4b28-8f50-9e3a7c1f5b26" },
    { action_id: "d3f9a517-6c80-4e42-9a05-7b9c3e5f1d68", occurred_at: at(toponymStartedAt, 24), type: "ADDRESS_ENTERED", field: "address.street", previous_value: null, value: "Дубининская улица" },
    { action_id: "f7c3e951-0a24-4b86-9d49-1e3a5c7f9b02", occurred_at: at(toponymStartedAt, 39), type: "ADDRESS_ENTERED", field: "address.house", previous_value: null, value: "21" },
    { action_id: "a9e5c173-2c46-4d08-8b61-3a5c7e9f1b24", occurred_at: at(toponymStartedAt, 52), type: "ADDRESS_ENTERED", field: "address.floor", previous_value: null, value: "5" },
    { action_id: "b1c7e395-4e68-4f20-9d83-5c7e9a1f3b46", occurred_at: at(toponymStartedAt, 71), type: "FEATURE_SELECTED", feature: features.fireHouse },
    { action_id: "c3e9a517-6a80-4b42-8f05-7e9c1a3f5d68", occurred_at: at(toponymStartedAt, 88), type: "FEATURE_SELECTED", feature: features.fireBalcony },
    { action_id: "d5a1c739-8c02-4d64-9b27-9a1e3c5f7b80", occurred_at: at(toponymStartedAt, 104), type: "FEATURE_SELECTED", feature: features.fireSmoke },
    { action_id: "e7c3e951-0e24-4f86-8d49-1c3a5e7f9b02", occurred_at: at(toponymStartedAt, 121), type: "SERVICE_ADDED", service: services.fire, added_reason: "EKP" },
    { action_id: "f9e5c173-2a46-4b08-9f61-3c5a7e9f1b24", occurred_at: at(toponymStartedAt, 142), type: "FIELD_CHANGED", field: "description", previous_value: null, value: "Горит балкон на 5 этаже, открытое пламя, пострадавших не видят, наблюдают с улицы. Дом не газифицирован." },
    { action_id: "a1c7e395-4c68-4d20-8b83-5e7c9a1f3b46", occurred_at: at(toponymStartedAt, 160), type: "CALL_ENDED" },
    { action_id: "b3e9a517-6e80-4f42-9d05-7c9e1a3f5b68", occurred_at: at(toponymStartedAt, 167), type: "CARD_SAVED", incident_card_id: "5a9c3e7f-1d64-4b28-8f50-9e3a7c1f5b26" },
  ],
  expert_review: null,
};

export const attemptMocks: Attempt[] = [
  cleanAttempt,
  missedMainServiceAttempt,
  normExceededAttempt,
  ddsStatusAttempt,
  toponymAttempt,
];

function toSummary(attempt: Attempt): AttemptSummary {
  const total = attempt.expert_review?.total ?? attempt.score.total;

  return {
    attempt_id: attempt.attempt_id,
    lesson_id: attempt.lesson_id,
    assignment_id: attempt.assignment_id,
    attempt_number: attempt.attempt_number,
    mode: attempt.mode,
    student: attempt.student,
    scenario: {
      scenario_id: attempt.scenario.scenario_id,
      revision: attempt.scenario.revision,
      name: attempt.scenario.name,
      difficulty: attempt.scenario.difficulty,
    },
    completed_at: attempt.completed_at,
    timings: {
      ack: attempt.mode === "DDS" ? attempt.timings.ack : null,
      fill: attempt.timings.fill,
    },
    total,
    passed: attempt.score.passed,
    is_reviewed: attempt.expert_review !== null,
    error_counts: {
      critical: attempt.errors.filter((error) => error.severity === "CRITICAL").length,
      significant: attempt.errors.filter((error) => error.severity === "SIGNIFICANT").length,
      minor: attempt.errors.filter((error) => error.severity === "MINOR").length,
    },
  };
}

export const attemptSummaryMocks: AttemptSummary[] = attemptMocks.map(toSummary);
