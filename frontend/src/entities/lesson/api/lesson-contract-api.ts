import {
  api,
  RequestError,
  toLessonResult,
  type LessonDto,
  type LessonResult,
  type LessonResultDto,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import type { LessonListItem } from "../model/lesson";
import { lessonContractMocks, lessonResultMocks } from "./lesson-contract.mocks";

function toLessonListItem(dto: LessonDto): LessonListItem {
  return {
    lesson_id: dto.lesson_id,
    name: dto.name,
    group_name: dto.group_name,
    scenarios_count: dto.scenarios_count,
    attempts_total: dto.attempts_total,
    average_total: dto.average_total,
    status: dto.status,
    started_at: dto.started_at,
    assigned_at: dto.assigned_at ?? undefined,
    due_at: dto.due_at ?? undefined,
    attempts_allowed: dto.attempts_allowed ?? undefined,
  };
}

export async function fetchContractLessons(signal?: AbortSignal): Promise<LessonListItem[]> {
  if (mocks.lessons) return lessonContractMocks.map(toLessonListItem);

  const { data } = await api.get<LessonDto[]>(`${CARD_API_URL}/lessons`, { signal });

  return data.map(toLessonListItem);
}

export async function fetchLessonResults(
  lessonId: string,
  signal?: AbortSignal,
): Promise<LessonResult[]> {
  if (mocks.lessonResults) {
    const results = lessonResultMocks[lessonId];
    if (!results) throw new RequestError(404, `Занятие ${lessonId} не найдено`);

    return results.map(toLessonResult);
  }

  const { data } = await api.get<LessonResultDto[]>(
    `${CARD_API_URL}/lessons/${lessonId}/results`,
    { signal },
  );

  return data.map(toLessonResult);
}
