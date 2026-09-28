import source from "../data/incident-classifier.json?raw";

type ClassifierRow = [
  number,
  number,
  number,
  number,
  number,
  string,
  string | null,
  string | null,
  string | null,
  string | null,
  string,
  string | null,
  string | null,
  string | null,
  [number, string][],
];
type RouteDefinition = [number, string, string | null, string | null];
const reference = JSON.parse(source) as {
  records: ClassifierRow[];
  route_definitions: RouteDefinition[];
};

export interface ClassifierRecord {
  id: number;
  codes: [number, number, number, number];
  group: string;
  features: [string | null, string | null, string | null];
  additional: string | null;
  name: string;
  externalName: string | null;
  primaryService: string | null;
  routes: [number, string][];
}

export const classifierRecords: ClassifierRecord[] = reference.records
  .filter((row) => row[6] !== "Не отображается оператору 112")
  .map((row) => ({
    id: row[0],
    codes: [row[1], row[2], row[3], row[4]],
    group: row[5].trim(),
    features: [row[6], row[7], row[8]],
    additional: row[9],
    name: row[10],
    externalName: row[11],
    primaryService: row[13]?.trim() || null,
    routes: row[14],
  }));

export const classifierGroups = [
  ...new Set(classifierRecords.map((row) => row.group)),
];
export const routingFlags = [
  ["casualties", "Пострадавшие / погибшие"],
  ["absent", "Пострадавшие не на месте"],
  ["noAccess", "Нет доступа / заблокированные"],
  ["threat", "Угроза людям"],
  ["offence", "Правонарушение"],
  ["gas", "Газификация"],
  ["medical", "Требуется медицинская помощь"],
  ["evacuation", "Требуется эвакуация"],
  ["mass", "Более 5 человек / ОД"],
  ["traffic", "Перекрытие движения"],
  ["tunnel", "Тоннель"],
  ["pedestrian", "Пешеходное сооружение (пеш)"],
  ["road", "Автомобильное сооружение (ав)"],
  ["communications", "Объект связи"],
  ["construction", "Стройка"],
  ["culture", "Объект из перечня Департамента культуры"],
] as const;
export type RoutingFlag = (typeof routingFlags)[number][0];
export type RoutingFlags = Partial<Record<RoutingFlag, boolean>>;

export function getFeatureOptions(
  group: string,
  selected: (string | null)[],
  level: number,
) {
  return [
    ...new Set(
      classifierRecords
        .filter(
          (row) =>
            row.group === group &&
            row.features
              .slice(0, level)
              .every((value, index) => value === selected[index]),
        )
        .map((row) => row.features[level]),
    ),
  ];
}

export function getClassificationMatches(
  group: string,
  selected: (string | null)[],
) {
  return classifierRecords.filter(
    (row) =>
      row.group === group &&
      row.features.every((value, i) => value === selected[i]),
  );
}

export function resolveClassification(
  group: string,
  selected: (string | null)[],
  recordId?: number | null,
) {
  const matches = getClassificationMatches(group, selected);
  return matches.length === 1
    ? matches[0]
    : matches.find((row) => row.id === recordId);
}

// Условия соответствуют route_definitions исходного справочника. Отрицательные
// ветки взаимоисключаются с положительными; несколько положительных объединяются.
function routeApplies(id: number, f: RoutingFlags): boolean {
  const conditions: Record<number, boolean> = {
    0: !f.noAccess,
    1: !!f.noAccess,
    2: !f.threat && !f.casualties && !f.noAccess,
    3: !!f.threat,
    4: !!f.casualties,
    5: !!f.noAccess,
    7: !f.offence && !f.casualties,
    8: !!f.offence,
    9: !!f.casualties,
    10: !f.casualties && !f.absent,
    11: !!f.casualties && !f.absent,
    12: !!f.absent,
    13: !f.gas,
    14: !!f.gas,
    15: !f.threat && !f.casualties && !f.medical && !f.evacuation,
    16: !!f.threat,
    17: !!f.casualties,
    18: !!f.medical,
    19: !!f.evacuation,
    20: !f.mass,
    21: !!f.mass,
    24: !f.casualties && !f.traffic,
    25: !!f.casualties,
    26: !!f.traffic,
    28: !f.tunnel && !f.pedestrian && !f.road,
    29: !!f.tunnel,
    30: !!f.pedestrian,
    31: !!f.road,
    34: !!f.communications,
    64: !f.construction,
    65: !!f.construction,
    68: !!f.culture,
    79: !f.traffic,
    80: !!f.traffic,
  };
  return conditions[id] ?? true;
}

function routeServiceName([id, group, channel]: RouteDefinition) {
  if (id <= 6) return channel?.trim() ?? group;
  const names: Record<string, string> = {
    "Классификатор МВД": "Служба 102",
    "Классификатор СМП": "Служба 103",
    "Классификатор МОСГАЗ": "Служба 104",
    "Классификатор ФСБ": "ФСБ",
    "Классификатор Мособлгаз": "Мособлгаз",
  };
  return (names[group] ?? group).replace(/\s+/g, " ").trim();
}

export const classifierServiceNames = [
  ...new Set(reference.route_definitions.map(routeServiceName)),
];
export interface RoutedService {
  code: string;
  name: string;
  reasons: string[];
}

// route_id в JSON не содержит UUID службы. Эти коды связывают его с GET /services.
const routeServiceCodes = [
  "101",
  "101",
  "ODS_PSC",
  "ODS_PSC",
  "ODS_PSC",
  "ODS_PSC",
  "MGPSS",
  "102",
  "102",
  "102",
  "103",
  "103",
  "103",
  "104",
  "104",
  "ZEMP",
  "ZEMP",
  "ZEMP",
  "ZEMP",
  "ZEMP",
  "FSB",
  "FSB",
  "MOSOBLGAZ",
  "AUTOROADS",
  "MOSGORTRANS",
  "MOSGORTRANS",
  "MOSGORTRANS",
  "GKH",
  "GORMOST",
  "GORMOST",
  "GORMOST",
  "GORMOST",
  "MOSCOW_CANAL",
  "MGTS",
  "MGTS",
  "METRO",
  "MOSVODOCANAL",
  "MOEK",
  "MOESK",
  "OEK",
  "MOSLIFT",
  "ZODD",
  "DEP_GKH",
  "DEP_RBIPK",
  "DEP_RBIPK",
  "MAYOR_OFFICE",
  "MOSCOLLECTOR",
  "RZD",
  "DEP_EDUCATION",
  "CENTERREGIONVODKHOZ",
  "MILITARY_COMMANDANT",
  "OATI",
  "MOSVODOSTOK",
  "DEP_PPIOOS",
  "DEP_TSZN",
  "RSVO",
  "EVAZHD",
  "MSPPN",
  "DTU_R",
  "DTU",
  "ROSGVARDIA",
  "TERRITORIAL_OIV",
  "TERRITORIAL_OIV_TINAO",
  "AUTOROADS_AO",
  "DEP_CONSTRUCTION",
  "DEP_CONSTRUCTION",
  "VET_COMMITTEE",
  "MOSZHILINSPEKTSIYA",
  "DEP_CULTURE",
  "CSA_GLINKA",
  "GKU_NTU",
  "FSO",
  "GUP_MSR",
  "GUP_MSR",
  "DEP_TOURISM",
  "DGP",
  "DGP",
  "CUKB_DEFENSE",
  "CUKB_UAV_DEFENSE",
  "TRANSPORT_ORGANIZER",
  "TRANSPORT_ORGANIZER",
  "MOSECOMONITORING",
  "DEFENSE_RCB",
  "DEFENSE_RCB",
  "CITYENERGO",
  "DEP_CIVIL_CONSTRUCTION",
];

export function resolveServices(
  record: ClassifierRecord | undefined,
  flags: RoutingFlags,
): RoutedService[] {
  const services = new Map<string, { name: string; reasons: Set<string> }>();
  for (const [id, value] of record?.routes ?? []) {
    if (
      !routeApplies(id, flags) ||
      /нет реагирования|без оповещения|по согласованию/i.test(value)
    )
      continue;
    const definition = reference.route_definitions.find(
      (item) => item[0] === id,
    );
    if (!definition) continue;
    const name = routeServiceName(definition);
    const code = routeServiceCodes[id] ?? "";
    const service = services.get(code) ?? {
      name,
      reasons: new Set<string>(),
    };
    service.reasons.add(value);
    services.set(code, service);
  }
  return [...services].map(([code, service]) => ({
    code,
    name: service.name,
    reasons: [...service.reasons],
  }));
}
