import { discrepancyLabel } from "@/entities/expert-review";
import type { EmergencyService, LessonReviewDto, LessonReviewRequestDto, MonitoredSession } from "@/shared/api";
import { criterionLabels, REACTION_NORMS_TEXT, type CriterionCode } from "@/shared/config";
import type { Lesson } from "./build-lessons";
import type { AttemptLink, CriterionSummary, FindingOccurrence, LessonFindingsSummary } from "./lesson-summary";

export type LessonReviewSource = "ai" | "algorithm";

export interface TypicalError {
  title: string;
  description: string;
  studentsCount: number;
  sessionIds: string[];
}

export interface StudentNote {
  sessionId: string;
  students: string;
  note: string;
}

export interface LessonAiReview {
  source: LessonReviewSource;
  model: string | null;
  generatedAt: string | null;
  summary: string;
  typicalErrors: TypicalError[];
  recommendations: string[];
  studentNotes: StudentNote[];
}

const RECOMMENDATIONS_LIMIT = 4;

const recommendationByCriterion: Record<CriterionCode, string> = {
  C1: "Разобрать с группой признаки 1–3 уровня: какие вопросы заявителю отличают соседние итоговые типы.",
  C2: "Повторить список оповещения по типам занятия и отдельно — главную службу: её пропуск критичен.",
  C3: "Потренировать опрос заявителя по опросной карте: ФИО, телефоны, число пострадавших.",
  C4: "Отработать уточнение адреса по буквам на созвучных топонимах, например «Дубнинская» и «Дубининская».",
  C5: `Сделать упор на нормативы реакции: ${REACTION_NORMS_TEXT}.`,
  C6: "Обратить внимание на грамотность описания со слов заявителя.",
  C7: "Повторить автомат статусов реагирования и обязательные комментарии к «Не принята» и «Отказ от выполнения работ».",
};

const DEADLINE_RECOMMENDATION = recommendationByCriterion.C5;
const CALM_RECOMMENDATION = "Устойчивых повторяющихся ошибок нет: можно повысить сложность сценария или добавить процедурную подачу.";

function uniqueStudents(links: AttemptLink[]): number {
  return new Set(links.map((link) => link.students)).size;
}

function uniqueSessions(links: AttemptLink[]): string[] {
  return [...new Set(links.map((link) => link.sessionId))];
}

function mostFrequentPath(occurrences: FindingOccurrence[]): string | null {
  const counts = new Map<string, number>();

  for (const occurrence of occurrences) counts.set(occurrence.path, (counts.get(occurrence.path) ?? 0) + 1);

  return [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] ?? null;
}

function criterionError(criterion: CriterionSummary, services: Map<string, EmergencyService> | undefined): TypicalError {
  const path = mostFrequentPath(criterion.occurrences);

  return {
    title: `${criterion.code} ${criterionLabels[criterion.code]}`,
    description: [
      `Расхождения в ${criterion.attemptsWithFindings} из ${criterion.applicableAttempts} попыток.`,
      path === null ? null : `Чаще всего — «${discrepancyLabel(path, services)}».`,
    ]
      .filter(Boolean)
      .join(" "),
    studentsCount: uniqueStudents(criterion.occurrences),
    sessionIds: uniqueSessions(criterion.occurrences),
  };
}

function deadlineError(title: string, description: string, links: AttemptLink[]): TypicalError[] {
  return links.length === 0
    ? []
    : [{ title, description, studentsCount: uniqueStudents(links), sessionIds: uniqueSessions(links) }];
}

function studentNotes(summary: LessonFindingsSummary): StudentNote[] {
  const bySession = new Map<string, { students: string; counts: Map<CriterionCode, number> }>();

  for (const criterion of summary.criteria) {
    for (const occurrence of criterion.occurrences) {
      const entry = bySession.get(occurrence.sessionId) ?? { students: occurrence.students, counts: new Map() };

      entry.counts.set(criterion.code, (entry.counts.get(criterion.code) ?? 0) + 1);
      bySession.set(occurrence.sessionId, entry);
    }
  }

  return [...bySession.entries()].map(([sessionId, { students, counts }]) => {
    const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const [top] = [...counts.entries()].sort((first, second) => second[1] - first[1]);

    return {
      sessionId,
      students,
      note: `Расхождений: ${total}${top ? `, больше всего — «${criterionLabels[top[0]]}»` : ""}.`,
    };
  });
}

export function algorithmicLessonReview(
  summary: LessonFindingsSummary,
  services: Map<string, EmergencyService> | undefined,
): LessonAiReview {
  const withFindings = summary.criteria.filter((criterion) => criterion.attemptsWithFindings > 0);
  const deadlines = [
    ...deadlineError("Карточка раскрыта позже срока", "Нарушен норматив открытия карточки.", summary.openMissed),
    ...deadlineError("Решение по карточке позже срока", "Решение принять или отклонить принято позже срока.", summary.decisionMissed),
  ];
  const recommendations = [
    ...new Set([
      ...withFindings.map((criterion) => recommendationByCriterion[criterion.code]),
      ...(deadlines.length > 0 ? [DEADLINE_RECOMMENDATION] : []),
    ]),
  ].slice(0, RECOMMENDATIONS_LIMIT);
  const topLabels = withFindings.slice(0, 2).map((criterion) => `«${criterionLabels[criterion.code]}»`);

  return {
    source: "algorithm",
    model: null,
    generatedAt: null,
    summary:
      summary.analyzed === 0
        ? "Завершённых попыток с разбором пока нет."
        : `Разобрано попыток: ${summary.analyzed}. ${
            topLabels.length === 0
              ? "Расхождений не найдено."
              : `Чаще всего ошибались по ${topLabels.length === 1 ? "критерию" : "критериям"} ${topLabels.join(" и ")}.`
          }`,
    typicalErrors: [...withFindings.map((criterion) => criterionError(criterion, services)), ...deadlines],
    recommendations: recommendations.length > 0 ? recommendations : [CALM_RECOMMENDATION],
    studentNotes: studentNotes(summary),
  };
}

function studentNames(sessions: MonitoredSession[]): Map<string, string> {
  return new Map(sessions.flatMap((session) => session.participants.map((participant) => [participant.userId, participant.displayName])));
}

export function toLessonAiReview(dto: LessonReviewDto, sessions: MonitoredSession[]): LessonAiReview {
  const names = studentNames(sessions);

  return {
    source: "ai",
    model: dto.model,
    generatedAt: dto.generated_at,
    summary: dto.summary,
    typicalErrors: dto.typical_errors.map((error) => ({
      title: error.title,
      description: error.description,
      studentsCount: error.students_count,
      sessionIds: error.session_ids,
    })),
    recommendations: dto.recommendations,
    studentNotes: dto.student_notes.map((note) => ({
      sessionId: note.session_id,
      students: names.get(note.student_id) ?? "Обучаемый",
      note: note.note,
    })),
  };
}

export function lessonReviewRequest(lesson: Lesson, teacherId: string): LessonReviewRequestDto {
  return {
    teacher_id: teacherId,
    assignment_batch_id: lesson.batchId,
    assignment_ids: lesson.assignments.map((assignment) => assignment.id),
    session_ids: lesson.attempts.map((session) => session.sessionId),
  };
}
