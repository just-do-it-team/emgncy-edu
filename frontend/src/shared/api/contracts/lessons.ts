export type LessonStatusDto = "PLANNED" | "RUNNING" | "FINISHED" | "CANCELLED";

export interface LessonDto {
  lesson_id: string;
  name: string;
  group_name: string;
  scenarios_count: number;
  attempts_total: number;
  average_total: number | null;
  status: LessonStatusDto;
  started_at: string;
  assigned_at: string | null;
  due_at: string | null;
  attempts_allowed: number | null;
}
