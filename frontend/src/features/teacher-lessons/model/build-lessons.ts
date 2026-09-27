import { ABORTED_SESSION_STATUS, COMPLETED_SESSION_STATUS } from "@/entities/monitoring";
import type { MonitoredSession, TeacherAssignment } from "@/shared/api";

export type LessonStatus = "PLANNED" | "RUNNING" | "FINISHED" | "CANCELLED";

export const lessonStatusLabels: Record<LessonStatus, string> = {
  PLANNED: "Запланировано",
  RUNNING: "Идёт",
  FINISHED: "Завершено",
  CANCELLED: "Отменено",
};

export interface LessonAverage {
  value: number;
  count: number;
}

export interface Lesson {
  id: string;
  scenarioId: string;
  scenarioName: string;
  batchId: string | null;
  groupName: string | null;
  passingScore: number | null;
  participantIds: string[];
  assignedAt: string;
  availableFrom: string | null;
  dueAt: string | null;
  status: LessonStatus;
  assignments: TeacherAssignment[];
  sessions: MonitoredSession[];
  attempts: MonitoredSession[];
  average: LessonAverage | null;
  passedCount: number;
  judgedCount: number;
  abortedCount: number;
}

const FINISHED_ASSIGNMENT_STATUSES = new Set(["COMPLETED", "EXPIRED", "CANCELLED"]);

function lessonStatus(assignments: TeacherAssignment[]): LessonStatus {
  const statuses = assignments.map((assignment) => assignment.status);

  if (statuses.every((status) => status === "CANCELLED")) return "CANCELLED";
  if (statuses.every((status) => FINISHED_ASSIGNMENT_STATUSES.has(status))) return "FINISHED";
  if (statuses.every((status) => status === "ASSIGNED")) return "PLANNED";

  return "RUNNING";
}

function earliest(values: string[]): string | null {
  return values.reduce<string | null>(
    (first, value) => (first === null || Date.parse(value) < Date.parse(first) ? value : first),
    null,
  );
}

function average(attempts: MonitoredSession[]): LessonAverage | null {
  const scores = attempts.flatMap((attempt) => (attempt.score === null ? [] : [attempt.score]));

  if (scores.length === 0) return null;

  return { value: scores.reduce((sum, score) => sum + score, 0) / scores.length, count: scores.length };
}

export function buildLessons(assignments: TeacherAssignment[], sessions: MonitoredSession[]): Lesson[] {
  const byLesson = new Map<string, TeacherAssignment[]>();

  for (const assignment of assignments) {
    const lessonId = assignment.batchId ?? assignment.id;
    byLesson.set(lessonId, [...(byLesson.get(lessonId) ?? []), assignment]);
  }

  return [...byLesson.entries()]
    .map(([id, members]): Lesson => {
      const assignmentIds = new Set(members.map((assignment) => assignment.id));
      const lessonSessions = sessions.filter((session) => assignmentIds.has(session.assignmentId));
      const attempts = lessonSessions.filter((session) => session.completedAt !== null);
      const completed = attempts.filter((attempt) => attempt.status === COMPLETED_SESSION_STATUS);
      const judged = completed.filter((attempt) => attempt.passed !== null);
      const [first] = members;
      const assignedAt = earliest(members.map((assignment) => assignment.createdAt)) ?? first.createdAt;

      return {
        id,
        scenarioId: first.scenarioId,
        scenarioName: first.scenarioName,
        batchId: first.batchId,
        groupName: first.groupName,
        passingScore: first.passingScore,
        participantIds: [
          ...new Set(
            members.flatMap((assignment) => assignment.participants.map((participant) => participant.userId)),
          ),
        ],
        assignedAt,
        availableFrom: earliest(members.flatMap((assignment) => assignment.availableFrom ?? [])),
        dueAt: earliest(members.flatMap((assignment) => assignment.dueAt ?? [])),
        status: lessonStatus(members),
        assignments: members,
        sessions: lessonSessions,
        attempts,
        average: average(completed),
        passedCount: judged.filter((attempt) => attempt.passed === true).length,
        judgedCount: judged.length,
        abortedCount: attempts.filter((attempt) => attempt.status === ABORTED_SESSION_STATUS).length,
      };
    })
    .sort((first, second) => Date.parse(second.assignedAt) - Date.parse(first.assignedAt));
}

function timeOrLast(value: string | null): number {
  return value === null ? Number.POSITIVE_INFINITY : Date.parse(value);
}

export function compareByNearestDue(first: Lesson, second: Lesson): number {
  const difference = timeOrLast(first.dueAt) - timeOrLast(second.dueAt);

  return Number.isNaN(difference) || difference === 0
    ? Date.parse(first.assignedAt) - Date.parse(second.assignedAt)
    : difference;
}

export const lessonStatusOrder: Record<LessonStatus, number> = {
  RUNNING: 0,
  PLANNED: 1,
  FINISHED: 2,
  CANCELLED: 3,
};
