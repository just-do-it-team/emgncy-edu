import { useQueries } from "@tanstack/react-query";
import { expertReviewContextQuery } from "@/entities/expert-review";
import { COMPLETED_SESSION_STATUS } from "@/entities/monitoring";
import type { Lesson } from "../model/build-lessons";
import { summarizeFindings, type AnalyzedAttempt, type LessonFindingsSummary } from "../model/lesson-summary";

export interface LessonFindingsState {
  total: number;
  pending: number;
  failed: number;
  summary: LessonFindingsSummary;
  retryFailed: () => void;
}

export function useLessonFindings(lesson: Lesson, teacherId: string): LessonFindingsState {
  const completed = lesson.attempts.filter((session) => session.status === COMPLETED_SESSION_STATUS);
  const results = useQueries({
    queries: completed.map((session) => expertReviewContextQuery(session.sessionId, teacherId)),
  });

  const analyzed: AnalyzedAttempt[] = results.flatMap((result, index) => {
    const session = completed[index];

    return result.data && session ? [{ session, context: result.data }] : [];
  });

  return {
    total: completed.length,
    pending: results.filter((result) => result.isPending).length,
    failed: results.filter((result) => result.isError).length,
    summary: summarizeFindings(analyzed),
    retryFailed: () =>
      results.filter((result) => result.isError).forEach((result) => void result.refetch()),
  };
}
