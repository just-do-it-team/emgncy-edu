import {
  api,
  toMonitoredSession,
  type MonitoredSession,
  type TeacherMonitoringSessionDto,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import type { SessionStatusFilter } from "./monitoring.keys";
import { monitoringSessionsMock } from "./monitoring.mocks";

const ANY_STATUS = "";

export async function fetchTeacherSessions(
  teacherId: string,
  status: SessionStatusFilter,
  signal?: AbortSignal,
): Promise<MonitoredSession[]> {
  if (mocks.monitoring) {
    return monitoringSessionsMock
      .filter((item) => status === "ANY" || item.status === status)
      .map(toMonitoredSession);
  }

  const { data } = await api.get<TeacherMonitoringSessionDto[]>(
    `${CARD_API_URL}/teacher-monitoring/sessions`,
    { params: { teacher_id: teacherId, status: status === "ANY" ? ANY_STATUS : status }, signal },
  );

  return data.map(toMonitoredSession);
}
