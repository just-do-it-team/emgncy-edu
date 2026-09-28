import { useQueries, useQuery } from "@tanstack/react-query";
import { fetchSessionActions, fetchTeacherSessions, monitoringKeys } from "@/entities/monitoring";
import type { MonitoredSession, TrainingActionDto } from "@/shared/api";
import { pollingDelay } from "../model/monitor";

const SESSIONS_POLL_MS = 5_000;
const ACTIONS_POLL_MS = 10_000;
const LIVE_GC_MS = 5 * 60 * 1000;
const RUNNING = "RUNNING";

export function useLiveSessions(teacherId: string) {
  return useQuery({
    queryKey: monitoringKeys.list(teacherId, "ANY"),
    queryFn: ({ signal }) => fetchTeacherSessions(teacherId, "ANY", signal),
    staleTime: 0,
    gcTime: LIVE_GC_MS,
    refetchInterval: () => pollingDelay(SESSIONS_POLL_MS, { hidden: document.hidden, active: true }),
    refetchOnWindowFocus: true,
    retry: false,
    meta: { showGlobalError: false },
  });
}

export interface LiveActions {
  bySession: Map<string, TrainingActionDto[]>;
  failed: boolean;
}

export function useLiveActions(sessions: MonitoredSession[]): LiveActions {
  return useQueries({
    queries: sessions.map((session) => {
      const active = session.status === RUNNING;

      return {
        queryKey: monitoringKeys.actions(session.sessionId),
        queryFn: ({ signal }: { signal: AbortSignal }) => fetchSessionActions(session.sessionId, signal),
        staleTime: active ? 0 : Infinity,
        gcTime: LIVE_GC_MS,
        refetchInterval: () => pollingDelay(ACTIONS_POLL_MS, { hidden: document.hidden, active }),
        refetchOnWindowFocus: active,
        retry: false,
        meta: { showGlobalError: false },
      };
    }),
    combine: (results) => ({
      bySession: new Map(
        results.flatMap((result, index) => {
          const session = sessions[index];

          return result.data && session ? [[session.sessionId, result.data] as const] : [];
        }),
      ),
      failed: results.some((result) => result.isError),
    }),
  });
}
