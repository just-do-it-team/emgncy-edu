import { USE_MOCKS } from "@/shared/config";
import { AttemptRequestError } from "./attempt-request-error";
import type { Attempt } from "../model/attempt";
import type { AttemptSummary } from "../model/attempt-summary";
import { attemptMocks, attemptSummaryMocks, demoStudentId } from "./attempt-mocks";

function notImplemented(endpoint: string): never {
  throw new AttemptRequestError(
    501,
    `${endpoint}: ручка на бэкенде не реализована, контракт — docs/api/attempts.md. Для работы на моках задайте VITE_USE_MOCKS=true`,
  );
}

function notFound(entity: string, id: string): never {
  throw new AttemptRequestError(404, `${entity} ${id} не найдена`);
}

export async function fetchAttempt(attemptId: string): Promise<Attempt> {
  if (!USE_MOCKS) {
    notImplemented("GET /api/v1/training-sessions/{training_session_id}/attempt");
  }

  return (
    attemptMocks.find((attempt) => attempt.attempt_id === attemptId) ??
    notFound("Попытка", attemptId)
  );
}

export async function fetchLessonAttempts(lessonId: string): Promise<AttemptSummary[]> {
  if (!USE_MOCKS) {
    notImplemented("GET /api/v1/lessons/{lesson_id}/attempts");
  }

  return attemptSummaryMocks.filter((summary) => summary.lesson_id === lessonId);
}

export async function fetchTodayAttempts(): Promise<AttemptSummary[]> {
  if (!USE_MOCKS) {
    notImplemented("GET /api/v1/lessons/attempts?day=today");
  }

  const today = new Date().toISOString().slice(0, 10);

  return attemptSummaryMocks.filter((summary) => summary.completed_at.slice(0, 10) === today);
}

export async function fetchMyAttempts(): Promise<AttemptSummary[]> {
  if (!USE_MOCKS) {
    notImplemented("GET /api/v1/students/me/attempts");
  }

  return attemptSummaryMocks.filter((summary) => summary.student.student_id === demoStudentId);
}

export interface ExpertReviewInput {
  attemptId: string;
  total: number;
  comment: string;
  reviewedBy: string;
  reviewedByName: string;
}

export async function reviewAttempt(input: ExpertReviewInput): Promise<Attempt> {
  if (!USE_MOCKS) {
    notImplemented("POST /api/v1/training-sessions/{training_session_id}/attempt/review");
  }

  const attempt =
    attemptMocks.find((item) => item.attempt_id === input.attemptId) ??
    notFound("Попытка", input.attemptId);

  return {
    ...attempt,
    expert_review: {
      reviewed_by: input.reviewedBy,
      reviewed_by_name: input.reviewedByName,
      reviewed_at: new Date().toISOString(),
      previous_total: attempt.expert_review?.total ?? attempt.score.total,
      total: input.total,
      comment: input.comment,
    },
  };
}
