import type { LessonReviewDto, MonitoredSession } from "@/shared/api";
import type { LessonAiReview } from "../model/lesson-ai-review";

const MOCK_MODEL = "gpt-oss-20b";

export function lessonReviewMock(basis: LessonAiReview, sessions: MonitoredSession[]): LessonReviewDto {
  const studentBySession = new Map(sessions.map((session) => [session.sessionId, session.participants[0]?.userId ?? ""]));

  return {
    summary: `${basis.summary} ${
      basis.typicalErrors.some((error) => error.studentsCount > 1)
        ? "Ошибки повторяются у нескольких обучаемых — это скорее пробел в подготовке группы, чем случайность."
        : basis.typicalErrors.length > 0
          ? "Ошибки единичные: их стоит разобрать индивидуально."
          : "Группа справилась ровно; явных пробелов в алгоритме работы не видно."
    }`,
    typical_errors: basis.typicalErrors.map((error) => ({
      title: error.title,
      description: error.description,
      students_count: error.studentsCount,
      session_ids: error.sessionIds,
    })),
    recommendations: basis.recommendations,
    student_notes: basis.studentNotes.map((note) => ({
      student_id: studentBySession.get(note.sessionId) ?? "",
      session_id: note.sessionId,
      note: `${note.note} Стоит пройти разбор попытки вместе с преподавателем.`,
    })),
    model: MOCK_MODEL,
    generated_at: new Date().toISOString(),
  };
}
