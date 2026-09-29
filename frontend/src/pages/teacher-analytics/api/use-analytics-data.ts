import { useQueries } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useAssignments } from "@/entities/assignment";
import { expertReviewContextQuery } from "@/entities/expert-review";
import { useGroups } from "@/entities/group";
import { COMPLETED_SESSION_STATUS, useTeacherSessions } from "@/entities/monitoring";
import { useScenarios } from "@/entities/scenario";
import { useStudentNames } from "@/entities/student";
import type { ExpertReviewContext, MonitoredSession } from "@/shared/api";
import { attemptFacts } from "../model/attempt-facts";

const DAY_MS = 24 * 60 * 60 * 1000;
const GROUP_PARAM = "group";
const PERIOD_PARAM = "period";
export const NO_GROUP = "none";
export const ALL_PERIOD = "all";
export const DEFAULT_PERIOD = "30";

export const periodOptions = [
  { value: "7", label: "7 дней" },
  { value: "30", label: "30 дней" },
  { value: "90", label: "90 дней" },
  { value: ALL_PERIOD, label: "Всё время" },
];

export function useAnalyticsFilters() {
  const [params, setParams] = useSearchParams();
  const period = periodOptions.some((option) => option.value === params.get(PERIOD_PARAM))
    ? (params.get(PERIOD_PARAM) ?? DEFAULT_PERIOD)
    : DEFAULT_PERIOD;

  const set = (key: string, value: string | null) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);

        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  return {
    group: params.get(GROUP_PARAM),
    period,
    setGroup: (value: string | null) => set(GROUP_PARAM, value),
    setPeriod: (value: string) => set(PERIOD_PARAM, value === DEFAULT_PERIOD ? null : value),
  };
}

/**
 * Данные аналитики из уже загружаемых источников: попытки из снимка монитора, порог зачёта из
 * назначений, сложность из сценариев и расхождения с лентой действий из контекста разбора каждой
 * попытки. Контексты грузятся параллельно и кэшируются так же, как в разборе и на странице занятия.
 */
export function useAnalyticsData(teacherId: string, group: string | null, period: string) {
  const sessions = useTeacherSessions(teacherId, "ANY");
  const assignments = useAssignments({ assignedBy: teacherId });
  const scenarios = useScenarios();
  const groups = useGroups(teacherId);
  const names = useStudentNames(teacherId);
  const assignmentsById = new Map((assignments.data ?? []).map((assignment) => [assignment.id, assignment]));
  const periodMs = period === ALL_PERIOD ? null : Number(period) * DAY_MS;
  const now = Date.now();
  const inGroup = (session: MonitoredSession) => {
    const groupId = assignmentsById.get(session.assignmentId)?.groupId ?? null;

    return group === null || (group === NO_GROUP ? groupId === null : groupId === group);
  };
  const completedBetween = (from: number | null, to: number) =>
    (sessions.data ?? []).filter((session) => {
      if (session.status !== COMPLETED_SESSION_STATUS || session.completedAt === null || !inGroup(session)) return false;

      const at = Date.parse(session.completedAt);

      return (from === null || at >= from) && at < to;
    });
  const completed = completedBetween(periodMs === null ? null : now - periodMs, Number.POSITIVE_INFINITY);
  // Прошлый период той же длины нужен только плиткам «к прошлому периоду»; для «всего времени» его нет.
  const previous = periodMs === null ? [] : completedBetween(now - 2 * periodMs, now - periodMs);
  const all = [...completed, ...previous];
  const contexts = useQueries({
    queries: all.map((session) => expertReviewContextQuery(session.sessionId, teacherId)),
  });
  const loaded = new Map<string, ExpertReviewContext>(
    contexts.flatMap((result, index) => {
      const session = all[index];

      return result.data && session ? [[session.sessionId, result.data] as const] : [];
    }),
  );
  const factsOf = (list: MonitoredSession[]) =>
    attemptFacts({
      sessions: list,
      assignments: assignmentsById,
      scenarios: new Map((scenarios.data ?? []).map((scenario) => [scenario.id, scenario])),
      contexts: loaded,
      names: names.data ?? new Map(),
    });

  return {
    pending: sessions.isPending || assignments.isPending || scenarios.isPending,
    error: sessions.isError || assignments.isError,
    retry: () => {
      void sessions.refetch();
      void assignments.refetch();
    },
    groups: groups.data ?? [],
    contextsTotal: all.length,
    contextsPending: contexts.filter((result) => result.isPending).length,
    contextsFailed: contexts.filter((result) => result.isError).length,
    retryContexts: () => contexts.filter((result) => result.isError).forEach((result) => void result.refetch()),
    facts: factsOf(completed),
    previousFacts: periodMs === null ? null : factsOf(previous),
  };
}
