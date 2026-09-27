import { useQuery } from "@tanstack/react-query";
import { fetchTeacherSessions } from "./monitoring-api";
import { monitoringKeys, type SessionStatusFilter } from "./monitoring.keys";

const LIST_STALE_MS = 30 * 1000;
const LIST_GC_MS = 5 * 60 * 1000;

export function useTeacherSessions(teacherId: string, status: SessionStatusFilter) {
  return useQuery({
    queryKey: monitoringKeys.list(teacherId, status),
    queryFn: ({ signal }) => fetchTeacherSessions(teacherId, status, signal),
    staleTime: LIST_STALE_MS,
    gcTime: LIST_GC_MS,
    meta: { showGlobalError: false },
  });
}
