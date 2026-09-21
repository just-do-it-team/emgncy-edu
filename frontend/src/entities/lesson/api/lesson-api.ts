import { RequestError } from "@/shared/api";
import { USE_MOCKS } from "@/shared/config";
import type { Lesson, LessonListItem, LessonSummary } from "../model/lesson";
import { lessonListMocks, lessonMocks, lessonSummaryMocks } from "./lesson-mocks";

function notImplemented(endpoint: string): never {
  throw new RequestError(
    501,
    `${endpoint}: ручка на бэкенде не реализована, контракт — docs/api/lessons.md. Для работы на моках задайте VITE_USE_MOCKS=true`,
  );
}

export async function fetchLessons(): Promise<LessonListItem[]> {
  if (!USE_MOCKS) notImplemented("GET /api/v1/lessons");

  return lessonListMocks;
}

export async function fetchLesson(lessonId: string): Promise<Lesson> {
  if (!USE_MOCKS) notImplemented("GET /api/v1/lessons/{lesson_id}");

  const lesson = lessonMocks.find((item) => item.lesson_id === lessonId);

  if (!lesson) throw new RequestError(404, `Занятие ${lessonId} не найдено`);

  return lesson;
}

export async function fetchLessonSummary(lessonId: string): Promise<LessonSummary> {
  if (!USE_MOCKS) notImplemented("GET /api/v1/lessons/{lesson_id}/summary");

  const summary = lessonSummaryMocks.find((item) => item.lesson_id === lessonId);

  if (!summary) throw new RequestError(409, "Занятие ещё не завершено, сводка не собрана");

  return summary;
}
