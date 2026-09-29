import { useQueries } from "@tanstack/react-query";
import { useEmergencyServices } from "@/entities/emergency-service";
import { expertReviewContextQuery, misspellingCount, spellingFields, spellingWords } from "@/entities/expert-review";
import {
  COMPLETED_SESSION_STATUS,
  fetchSessionActions,
  fillTimes,
  monitoringKeys,
  monitorNorms,
  serviceIdOf,
  type AttemptMetrics,
} from "@/entities/monitoring";
import type { MonitoredSession } from "@/shared/api";
import { useSpelling } from "@/shared/lib";
import type { Lesson } from "../model/build-lessons";

const ACTIONS_GC_MS = 10 * 60 * 1000;

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Метрики завершённых попыток занятия для таблицы, PDF и CSV. Время заполнения считается той же
 * функцией, что и таймеры монитора, по журналу действий попытки; отклонение — только у элементов с
 * нормативом (карточки ДДС). Орфография проверяется одним запросом к словарю на все попытки.
 */
export function useAttemptMetrics(lesson: Lesson, teacherId: string): Map<string, AttemptMetrics> {
  const services = useEmergencyServices();
  const completed = lesson.attempts.filter((session) => session.status === COMPLETED_SESSION_STATUS);
  const actions = useQueries({
    queries: completed.map((session) => ({
      queryKey: monitoringKeys.actions(session.sessionId),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchSessionActions(session.sessionId, signal),
      staleTime: Infinity,
      gcTime: ACTIONS_GC_MS,
      retry: false,
      meta: { showGlobalError: false },
    })),
  });
  const contexts = useQueries({
    queries: completed.map((session) => expertReviewContextQuery(session.sessionId, teacherId)),
  });
  const fields = new Map(
    completed.flatMap((session, index) => {
      const context = contexts[index]?.data;

      return context ? [[session.sessionId, spellingFields(context, null)] as const] : [];
    }),
  );
  const spelling = useSpelling([...fields.values()].flatMap(spellingWords));

  const timingOf = (session: MonitoredSession, index: number) => {
    const log = actions[index]?.data;

    if (log === undefined) return { fillMs: null, deviationMs: null };

    const dispatchers = session.participants.filter((participant) => participant.positionCode !== null).length;
    const times = session.participants.flatMap((participant) =>
      fillTimes(
        {
          participant: {
            userId: participant.userId,
            name: participant.displayName,
            role: participant.role,
            positionCode: participant.positionCode,
          },
          session,
          actions: log,
          serviceId: serviceIdOf(participant.positionCode, services.data),
          soleDispatcher: dispatchers === 1,
        },
        monitorNorms,
      ),
    );

    return {
      fillMs: mean(times.map((time) => time.ms)),
      deviationMs: mean(times.flatMap((time) => (time.normMs === null ? [] : [time.ms - time.normMs]))),
    };
  };

  return new Map(
    completed.map((session, index) => {
      const attemptFields = fields.get(session.sessionId);

      return [
        session.sessionId,
        {
          ...timingOf(session, index),
          misspellings: attemptFields && spelling.data ? misspellingCount(attemptFields, spelling.data) : null,
        },
      ];
    }),
  );
}
