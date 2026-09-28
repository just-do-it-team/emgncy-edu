import {
  api,
  toMonitoredSession,
  type MonitoredSession,
  type TeacherMonitoringSessionDto,
  type TrainingActionDto,
} from "@/shared/api";
import { CARD_API_URL, mocks } from "@/shared/config";
import {
  abortLessonMonitorSessionMock,
  lessonMonitorActionsMock,
  lessonMonitorSessionsMock,
} from "./lesson-monitor.mocks";
import type { SessionStatusFilter } from "./monitoring.keys";
import { monitoringSessionsMock } from "./monitoring.mocks";

const ANY_STATUS = "";

export async function fetchTeacherSessions(
  teacherId: string,
  status: SessionStatusFilter,
  signal?: AbortSignal,
): Promise<MonitoredSession[]> {
  if (mocks.monitoring) {
    return [...monitoringSessionsMock, ...lessonMonitorSessionsMock()]
      .filter((item) => status === "ANY" || item.status === status)
      .map(toMonitoredSession);
  }

  const { data } = await api.get<TeacherMonitoringSessionDto[]>(
    `${CARD_API_URL}/teacher-monitoring/sessions`,
    { params: { teacher_id: teacherId, status: status === "ANY" ? ANY_STATUS : status }, signal },
  );

  return data.map(toMonitoredSession);
}

export async function fetchSessionActions(sessionId: string, signal?: AbortSignal): Promise<TrainingActionDto[]> {
  if (mocks.monitoring) return lessonMonitorActionsMock(sessionId) ?? [];

  const { data } = await api.get<TrainingActionDto[]>(`${CARD_API_URL}/training-sessions/${sessionId}/actions`, {
    signal,
  });

  return data;
}

export interface AbortSessionRequest {
  sessionId: string;
  teacherId: string;
  reason: string;
}

export async function abortSharedSession({ sessionId, teacherId, reason }: AbortSessionRequest): Promise<void> {
  if (mocks.monitoring) {
    if (!abortLessonMonitorSessionMock(sessionId, reason)) throw new Error("Попытка уже не идёт");

    return;
  }

  await api.post(`${CARD_API_URL}/training-sessions/${sessionId}/abort`, { teacher_id: teacherId, reason });
}
