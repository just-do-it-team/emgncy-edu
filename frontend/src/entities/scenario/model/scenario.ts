export type ScenarioStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type ScenarioMode = "ARM112" | "DDS";

export interface ScenarioFeature {
  level: 1 | 2 | 3;
  group: string;
  feature_id: number;
  code: string;
  name: string;
}

export interface ScenarioService {
  service_id: string;
  name: string;
  is_main: boolean;
}

export interface Scenario {
  scenario_id: string;
  revision: number;
  name: string;
  mode: ScenarioMode;
  status: ScenarioStatus;
  difficulty: 1 | 2 | 3 | 4 | 5;
  weight: number;
  fill_norm_seconds: number;
  incident_type_name: string;
  ekp35_incident_type: string;
  features: ScenarioFeature[];
  main_service: ScenarioService;
  notification_list: ScenarioService[];
  used_in_lessons: number;
}

export interface ScenarioListItem {
  scenario_id: string;
  name: string;
  incident_type_name: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  weight: number;
  fill_norm_seconds: number;
  used_in_lessons: number;
  status: ScenarioStatus;
}

export const scenarioStatusLabels: Record<ScenarioStatus, string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Опубликован",
  ARCHIVED: "В архиве",
};

export const scenarioModeLabels: Record<ScenarioMode, string> = {
  ARM112: "АРМ-112",
  DDS: "АРМ ДДС",
};
