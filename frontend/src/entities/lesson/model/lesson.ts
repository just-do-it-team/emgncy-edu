export type LessonStatus = "PLANNED" | "RUNNING" | "FINISHED" | "CANCELLED";

import type { CriterionCode } from "@/shared/config";

export interface LessonScenarioRef {
  scenario_id: string;
  name: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface LessonNorms {
  ack_seconds: number;
  fill_seconds: number;
}

export interface Lesson {
  lesson_id: string;
  name: string;
  group_id: string;
  group_name: string;
  scenarios: LessonScenarioRef[];
  norms: LessonNorms;
  started_at: string;
  finished_at: string | null;
  status: LessonStatus;
  participants_count: number;
}

export interface LessonCriterionSummary {
  weight: number;
  value: number;
  points: number;
}

export interface LessonErrorCounts {
  critical: number;
  significant: number;
  minor: number;
}

export interface LessonSummary {
  lesson_id: string;
  attempts_total: number;
  attempts_passed: number;
  average_total: number;
  criteria: Record<CriterionCode, LessonCriterionSummary>;
  error_counts: LessonErrorCounts;
}

export interface LessonListItem {
  lesson_id: string;
  name: string;
  group_name: string;
  scenarios_count: number;
  attempts_total: number;
  average_total: number | null;
  status: LessonStatus;
  started_at: string;
}

export const lessonStatusLabels: Record<LessonStatus, string> = {
  PLANNED: "Запланировано",
  RUNNING: "Идёт",
  FINISHED: "Завершено",
  CANCELLED: "Отменено",
};
