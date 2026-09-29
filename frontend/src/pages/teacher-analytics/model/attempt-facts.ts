import { buildReviewBreakdown } from "@/entities/expert-review";
import { lessonKeyOf } from "@/entities/monitoring";
import type {
  ActionEvent,
  Discrepancy,
  ExpertReviewContext,
  MonitoredParticipant,
  MonitoredSession,
  ScenarioListItem,
  TeacherAssignment,
} from "@/shared/api";
import { CARD_OPEN_NORM_SECONDS, FIRST_ENTRY_NORM_SECONDS } from "@/shared/config";
import { analyticsColumns, type AnalyticsColumn, type AttemptFacts, type NormFacts } from "./student-stats";

const SECOND_MS = 1000;

function firstAt(events: ActionEvent[]): number | null {
  const times = events.map((event) => Date.parse(event.occurredAt));

  return times.length === 0 ? null : Math.min(...times);
}

/**
 * Нормативы по карточкам ДДС, которые обрабатывал участник: раскрытие за 30 с и первая запись
 * (решение или статус с непустым комментарием) за 3 мин от выпуска карточки. Карточка засчитывается
 * участнику, если он её открыл; единственному диспетчеру попытки — любая выпущенная карточка, так
 * что нераскрытая тоже считается нарушением.
 */
function normFacts(actions: ActionEvent[], userId: string, soleDispatcher: boolean): NormFacts {
  const own = actions.filter((action) => action.actorUserId === userId);
  const releases = actions.flatMap((action) =>
    action.kind === "card_created" && action.releasedByScenario && action.incidentCardId !== null
      ? [{ cardId: action.incidentCardId, at: Date.parse(action.occurredAt) }]
      : [],
  );
  const facts: NormFacts = { opens: 0, opensOnTime: 0, entries: 0, entriesOnTime: 0, openMs: [], entryMs: [] };

  for (const release of releases) {
    const onCard = own.filter((action) => action.incidentCardId === release.cardId);
    const openedAt = firstAt(onCard.filter((action) => action.kind === "card_opened"));
    const enteredAt = firstAt(
      onCard.filter(
        (action) =>
          (action.kind === "service_decision" || action.kind === "service_status_changed") &&
          (action.comment ?? "").trim() !== "",
      ),
    );

    if (openedAt === null && !soleDispatcher) continue;

    facts.opens += 1;
    facts.entries += 1;

    if (openedAt !== null) {
      facts.openMs.push(openedAt - release.at);
      if (openedAt - release.at <= CARD_OPEN_NORM_SECONDS * SECOND_MS) facts.opensOnTime += 1;
    }
    if (enteredAt !== null) {
      facts.entryMs.push(enteredAt - release.at);
      if (enteredAt - release.at <= FIRST_ENTRY_NORM_SECONDS * SECOND_MS) facts.entriesOnTime += 1;
    }
  }

  return facts;
}

/**
 * Какие проверки применимы к участнику и в каких есть ошибки. Звонки относятся к оператору 112,
 * который их принял, карточки — к диспетчерам ДДС; внутри попытки сервер расхождения к участнику
 * не привязывает, поэтому в общей попытке они общие для всех участников той же роли. Ошибки
 * только в оформлении текста не считаются.
 */
function errorFacts(context: ExpertReviewContext, participant: MonitoredParticipant, soleParticipant: boolean) {
  const callOperators = new Map(
    context.actions.flatMap((action) =>
      action.kind === "call" && action.stage === "answered" && action.entityId !== null
        ? [[action.entityId, action.actorUserId] as const]
        : [],
    ),
  );
  const discrepancies: Discrepancy[] =
    participant.role === "OPERATOR_112"
      ? context.incomingCalls
          .filter((call) => soleParticipant || callOperators.get(call.trainingCallId) === participant.userId)
          .flatMap((call) => call.automaticResult?.discrepancies ?? [])
      : context.cards.flatMap((card) => card.automaticResult?.discrepancies ?? []);
  const breakdown = buildReviewBreakdown(discrepancies, participant.role);
  const errors = new Map<AnalyticsColumn, boolean>();

  for (const criterion of breakdown.criteria) {
    const column = analyticsColumns.find((candidate) => candidate === criterion.code);

    if (column !== undefined && criterion.applicable) {
      errors.set(column, criterion.findings.some((finding) => !finding.formattingOnly));
    }
  }

  const expectsReport = context.cards.some((card) => card.expectedResult.outbound_call != null);

  if (participant.role === "DDS" && expectsReport) {
    errors.set("outbound", breakdown.modelEvaluation.length > 0);
  }

  return errors;
}

export interface FactsInput {
  sessions: MonitoredSession[];
  assignments: Map<string, TeacherAssignment>;
  scenarios: Map<string, ScenarioListItem>;
  contexts: Map<string, ExpertReviewContext>;
  names: Map<string, string>;
}

export function attemptFacts({ sessions, assignments, scenarios, contexts, names }: FactsInput): AttemptFacts[] {
  return sessions.flatMap((session) => {
    if (session.completedAt === null) return [];

    const assignment = assignments.get(session.assignmentId);
    const scenario = assignment ? scenarios.get(assignment.scenarioId) : undefined;
    const context = contexts.get(session.sessionId);
    const completedAt = session.completedAt;
    const dispatchers = session.participants.filter((participant) => participant.role === "DDS");

    return session.participants.map((participant) => ({
      sessionId: session.sessionId,
      studentId: participant.userId,
      studentName: names.get(participant.userId) ?? participant.displayName,
      groupName: session.groupName,
      lessonKey: lessonKeyOf(session),
      completedAt,
      score: session.score,
      passed: session.passed,
      passingScore: assignment?.passingScore ?? null,
      difficulty: scenario?.difficulty ?? null,
      role: participant.role,
      errors: context === undefined ? null : errorFacts(context, participant, session.participants.length === 1),
      norms:
        context === undefined || participant.role !== "DDS"
          ? null
          : normFacts(context.actions, participant.userId, dispatchers.length === 1),
    }));
  });
}
