import {
  buildReviewBreakdown,
  readableDiscrepancies,
  reviewCriterionCodes,
  roleCriteria,
  type ClassifierNames,
} from "@/entities/expert-review";
import { classifierRecordById, routingFlagLabel } from "@/entities/incident";
import { COMPLETED_SESSION_STATUS } from "@/entities/monitoring";
import type {
  Discrepancy,
  ExpertReviewContext,
  JsonValue,
  MonitoredSession,
  ParticipantRole,
} from "@/shared/api";
import type { CriterionCode } from "@/shared/config";
import type { Lesson } from "./build-lessons";

export const MIN_ATTEMPTS_FOR_RANKING = 3;

const INTERRUPTED_STATUSES = new Set(["ABORTED", "TIMED_OUT"]);
const OPEN_DEADLINE = /^service_handling\.[^.]+\.open_deadline$/;
const DECISION_DEADLINE = /^service_handling\.[^.]+\.decision_deadline$/;

export interface AnalyzedAttempt {
  session: MonitoredSession;
  context: ExpertReviewContext;
}

export interface AttemptLink {
  sessionId: string;
  students: string;
  elementKey: string | null;
  elementLabel: string | null;
  path: string | null;
}

export interface FindingOccurrence extends AttemptLink {
  path: string;
  expected: JsonValue;
  actual: JsonValue;
}

export interface CriterionSummary {
  code: CriterionCode;
  applicableAttempts: number;
  attemptsWithFindings: number;
  occurrences: FindingOccurrence[];
}

export interface RepeatedDiscrepancy {
  path: string;
  expected: JsonValue;
  actual: JsonValue;
  studentsCount: number;
  occurrences: FindingOccurrence[];
}

export interface LessonFindingsSummary {
  analyzed: number;
  unattributed: AttemptLink[];
  criteria: CriterionSummary[];
  repeated: RepeatedDiscrepancy[];
  openMissed: AttemptLink[];
  decisionMissed: AttemptLink[];
}

export interface ScoreDistribution {
  min: number;
  median: number;
  max: number;
  count: number;
}

interface ReviewedElement {
  key: string;
  label: string;
  incidentCardId: string | null;
  discrepancies: Discrepancy[];
}

function studentsOf(session: MonitoredSession): string {
  return session.participants.map((participant) => participant.displayName).join(", ") || "—";
}

function studentKey(session: MonitoredSession): string {
  return session.participants
    .map((participant) => participant.userId)
    .sort()
    .join(",");
}

function roleOf(session: MonitoredSession): ParticipantRole | null {
  const roles = new Set(session.participants.map((participant) => participant.role));
  const [role] = roles;

  return roles.size === 1 && role !== undefined ? role : null;
}

const classifierNames: ClassifierNames = { recordOf: classifierRecordById, flagLabel: routingFlagLabel };

function elementsOf(context: ExpertReviewContext): ReviewedElement[] {
  const calls = [...context.incomingCalls]
    .sort(
      (first, second) =>
        (first.ringingAt === null ? Infinity : Date.parse(first.ringingAt)) -
        (second.ringingAt === null ? Infinity : Date.parse(second.ringingAt)),
    )
    .map((call, index) => ({
      key: `call:${call.trainingCallId}`,
      label: `Звонок ${index + 1}`,
      incidentCardId: call.incidentCardId,
      discrepancies: readableDiscrepancies(call.automaticResult?.discrepancies ?? [], classifierNames),
    }));
  const cards = context.cards.map((card, index) => ({
    key: `card:${card.scenarioCardKey}`,
    label: `Карточка ${index + 1}`,
    incidentCardId: card.incidentCardId,
    discrepancies: readableDiscrepancies(card.automaticResult?.discrepancies ?? [], classifierNames),
  }));

  return [...calls, ...cards];
}

function link(session: MonitoredSession, element: ReviewedElement | null, path: string | null): AttemptLink {
  return {
    sessionId: session.sessionId,
    students: studentsOf(session),
    elementKey: element?.key ?? null,
    elementLabel: element?.label ?? null,
    path,
  };
}

function missedDeadline(
  attempt: AnalyzedAttempt,
  elements: ReviewedElement[],
  pattern: RegExp,
  deadline: "open" | "decision",
): AttemptLink | null {
  for (const element of elements) {
    const found = element.discrepancies.find((discrepancy) => pattern.test(discrepancy.path));

    if (found) return link(attempt.session, element, found.path);
  }

  const action = attempt.context.actions.find(
    (event) => event.kind === "deadline_missed" && event.deadline === deadline,
  );

  if (!action) return null;

  const element =
    elements.find((item) => item.incidentCardId !== null && item.incidentCardId === action.incidentCardId) ??
    null;

  return link(attempt.session, element, null);
}

export function summarizeFindings(attempts: AnalyzedAttempt[]): LessonFindingsSummary {
  const criteria = new Map<CriterionCode, CriterionSummary>(
    reviewCriterionCodes.map((code) => [
      code,
      { code, applicableAttempts: 0, attemptsWithFindings: 0, occurrences: [] },
    ]),
  );
  const repeated = new Map<string, RepeatedDiscrepancy & { students: Set<string> }>();
  const unattributed: AttemptLink[] = [];
  const openMissed: AttemptLink[] = [];
  const decisionMissed: AttemptLink[] = [];

  for (const attempt of attempts) {
    const elements = elementsOf(attempt.context);
    const role = roleOf(attempt.session);

    for (const element of elements) {
      for (const discrepancy of element.discrepancies) {
        const key = JSON.stringify([discrepancy.path, discrepancy.expected, discrepancy.actual]);
        const entry = repeated.get(key) ?? {
          path: discrepancy.path,
          expected: discrepancy.expected,
          actual: discrepancy.actual,
          studentsCount: 0,
          occurrences: [],
          students: new Set<string>(),
        };

        entry.students.add(studentKey(attempt.session));
        entry.occurrences.push({ ...link(attempt.session, element, discrepancy.path), ...discrepancy });
        repeated.set(key, entry);
      }
    }

    if (role === null) {
      unattributed.push(link(attempt.session, null, null));
    } else {
      const withFindings = new Set<CriterionCode>();

      for (const element of elements) {
        for (const review of buildReviewBreakdown(element.discrepancies, role).criteria) {
          if (!review.applicable) continue;

          const summary = criteria.get(review.code);

          if (!summary) continue;

          for (const finding of review.findings) {
            summary.occurrences.push({ ...link(attempt.session, element, finding.path), ...finding });
            withFindings.add(review.code);
          }
        }
      }

      for (const summary of criteria.values()) {
        if (roleCriteria[role].has(summary.code)) summary.applicableAttempts += 1;
        if (withFindings.has(summary.code)) summary.attemptsWithFindings += 1;
      }
    }

    const open = missedDeadline(attempt, elements, OPEN_DEADLINE, "open");
    const decision = missedDeadline(attempt, elements, DECISION_DEADLINE, "decision");

    if (open) openMissed.push(open);
    if (decision) decisionMissed.push(decision);
  }

  const ranked = attempts.length >= MIN_ATTEMPTS_FOR_RANKING;
  const criteriaList = [...criteria.values()].filter((summary) => summary.applicableAttempts > 0);

  return {
    analyzed: attempts.length,
    unattributed,
    criteria: ranked
      ? criteriaList.sort((first, second) => second.attemptsWithFindings - first.attemptsWithFindings)
      : criteriaList,
    repeated: [...repeated.values()]
      .map(({ students, ...entry }) => ({ ...entry, studentsCount: students.size }))
      .filter((entry) => entry.studentsCount > 1)
      .sort((first, second) => second.studentsCount - first.studentsCount),
    openMissed,
    decisionMissed,
  };
}

export function scoreDistribution(attempts: MonitoredSession[]): ScoreDistribution | null {
  const scores = attempts
    .filter((attempt) => attempt.status === COMPLETED_SESSION_STATUS)
    .flatMap((attempt) => (attempt.score === null ? [] : [attempt.score]))
    .sort((first, second) => first - second);

  if (scores.length < MIN_ATTEMPTS_FOR_RANKING) return null;

  const middle = Math.floor(scores.length / 2);
  const median = scores.length % 2 === 0 ? (scores[middle - 1] + scores[middle]) / 2 : scores[middle];

  return { min: scores[0], median, max: scores[scores.length - 1], count: scores.length };
}

export function interruptedAttempts(lesson: Lesson): MonitoredSession[] {
  return lesson.sessions.filter((session) => INTERRUPTED_STATUSES.has(session.status));
}

export function participantsWithoutAttempts(lesson: Lesson): string[] {
  const tried = new Set(
    lesson.sessions.flatMap((session) => session.participants.map((participant) => participant.userId)),
  );

  return lesson.participantIds.filter((participantId) => !tried.has(participantId));
}
