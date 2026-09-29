import type { JsonObject, TeacherMonitoringSessionDto, TrainingActionDto } from "@/shared/api";

const epoch = Date.now();
const at = (seconds: number) => new Date(epoch + seconds * 1000).toISOString();

const teacherId = "6a8c0e2b-4d6f-4a1c-9e3b-5d7f9b1d3f28";
const fireServiceId = "3f8a1c5e-7b2d-4a96-8e0f-5c7a9e1b3d4f";
const ambulanceServiceId = "4a9b2d6f-8c3e-4ba7-9f1a-6d8b0f2c4e5a";

const students = {
  belova: { id: "4f6b8d0a-2c4e-4a6b-8d0f-6b8d0f2a4c85", name: "Белова Ксения Андреевна" },
  timofeev: { id: "1a3c5e7b-9d2f-4c6a-8e0b-2d4f6a8c0e91", name: "Тимофеев Артём Сергеевич" },
  orlov: { id: "2d4f6b8c-0e1a-4c3e-9b5d-7f9b1d3f5a74", name: "Орлов Дмитрий Игоревич" },
  kovaleva: { id: "0b1d3f5a-7c9e-4b2d-8f4a-6c8e0a2b4d63", name: "Ковалёва Анна Сергеевна" },
  guseva: { id: "8b0d2f4a-6c8e-4a1b-9d3f-5a7c9e1b3d64", name: "Гусева Марина Олеговна" },
};

const dispatcherLesson = {
  batchId: "7e9a1b3c-5d7f-4b9a-8c1e-3f5a7c9e1b62",
  groupId: "2b7e9c41-5a3d-4f86-9e1b-7c4a2d8f6e03",
  groupName: "УМЦ-112, группа 4",
  scenarioId: "e1a3c5e7-9b2d-4f6a-8c0e-2d4f6b8d0a73",
  scenarioName: "Пожар в жилом доме — ДДС 101",
};

const sharedLesson = {
  batchId: "6d8f0b2c-4e6a-4b9d-9f1c-3d5f7b9d1f2a",
  assignmentId: "e4a6c8d0-2f5b-4d9e-9a3c-5b7d9f1b3e68",
  groupId: "3c8f0d52-6b4e-4a97-8f2c-8d5b3e9a7f14",
  groupName: "УМЦ-112, группа 7",
  scenarioId: "d1f3b5c7-9e2a-4d4f-8b6c-8e0a2c4e6f57",
  scenarioName: "ДТП с пострадавшими на МКАД",
};

interface MockParticipant {
  id: string;
  name: string;
  positionCode: string;
}

interface MockSession {
  sessionId: string;
  assignmentId: string;
  workspaceId: string;
  lesson: typeof dispatcherLesson;
  participants: MockParticipant[];
  startedAt: number;
  finishedAt: number | null;
  finalStatus: "COMPLETED" | "ABORTED" | null;
  score: string | null;
  passed: boolean | null;
  actions: (session: MockSession) => TrainingActionDto[];
}

function action(
  session: MockSession,
  seconds: number,
  actionType: string,
  fields: { actor?: string | null; cardId?: string | null; entityId?: string | null; details?: JsonObject } = {},
): TrainingActionDto {
  return {
    id: `${session.sessionId}:${actionType}:${fields.cardId ?? "session"}:${seconds}`,
    training_session_id: session.sessionId,
    workspace_id: session.workspaceId,
    actor_user_id: fields.actor === undefined ? session.participants[0]?.id ?? null : fields.actor,
    incident_card_id: fields.cardId ?? null,
    action_type: actionType,
    entity_type: fields.cardId ? "incident_card" : "training_session",
    entity_id: fields.entityId ?? fields.cardId ?? null,
    occurred_at: at(seconds),
    result: "SUCCESS",
    before_state: null,
    after_state: null,
    details: fields.details ?? {},
  };
}

function dispatcherCard(
  session: MockSession,
  cardId: string,
  releasedAt: number,
  steps: { openedAfter?: number; entries?: { after: number; status: string; comment: string }[] },
): TrainingActionDto[] {
  const released = action(session, releasedAt, "CARD_RELEASED", { actor: null, cardId });
  const opened =
    steps.openedAfter === undefined
      ? []
      : [action(session, releasedAt + steps.openedAfter, "CARD_OPENED", { cardId, details: { service_id: fireServiceId } })];
  const entries = (steps.entries ?? []).map((entry) =>
    action(
      session,
      releasedAt + entry.after,
      entry.status === "ACCEPTED" ? "CARD_ACCEPTED" : "SERVICE_STATUS_CHANGED",
      { cardId, details: { service_id: fireServiceId, status: entry.status, comment: entry.comment } },
    ),
  );

  return [released, ...opened, ...entries];
}

function individual(
  student: { id: string; name: string },
  fields: Pick<MockSession, "sessionId" | "assignmentId" | "workspaceId" | "startedAt" | "finishedAt" | "finalStatus" | "score" | "passed" | "actions">,
): MockSession {
  return { ...fields, lesson: dispatcherLesson, participants: [{ ...student, positionCode: "101" }] };
}

const sessions: MockSession[] = [
  individual(students.belova, {
    sessionId: "a1c3e5b7-9d2f-4b6a-8c0e-1f3b5d7a9c21",
    assignmentId: "c7e9a1b3-5d7f-4a2c-9e4b-6d8f0a2c4e81",
    workspaceId: "b2d4f6a8-0c1e-4b3d-8f5a-7c9e1b3d5f22",
    startedAt: -360,
    finishedAt: null,
    finalStatus: null,
    score: null,
    passed: null,
    actions: (session) => [
      action(session, -360, "SESSION_STARTED"),
      ...dispatcherCard(session, "c1e3a5b7-9d0f-4a2c-8e4b-6d8f0a2c4e11", -350, {
        openedAfter: 12,
        entries: [
          { after: 80, status: "ACCEPTED", comment: "Принято, высылаем расчёт ПСЧ-12" },
          { after: 150, status: "RESPONSE_STARTED", comment: "ПСЧ-12 выехал, 2 АЦ" },
          { after: 290, status: "ARRIVED", comment: "Расчёт на месте, разведка" },
        ],
      }),
      ...dispatcherCard(session, "c2e4a6b8-0d1f-4b3c-9e5a-7d9f1b3d5e12", 20, {}),
    ],
  }),
  individual(students.timofeev, {
    sessionId: "b3d5f7a9-1c2e-4d6b-9a0c-2e4a6c8e0b32",
    assignmentId: "d8f0a2c4-6e8a-4b3d-8f5c-7e9a1b3d5f92",
    workspaceId: "c4e6a8b0-2d3f-4c5e-9a7b-8d0f2b4d6a33",
    startedAt: -300,
    finishedAt: null,
    finalStatus: null,
    score: null,
    passed: null,
    actions: (session) => [
      action(session, -300, "SESSION_STARTED"),
      ...dispatcherCard(session, "c3f5b7d9-1e2a-4c4d-8f6b-8e0a2c4e6f13", -290, { openedAfter: 45 }),
    ],
  }),
  individual(students.orlov, {
    sessionId: "c5e7a9b1-3d4f-4e8c-8b2d-4f6b8d0a2c43",
    assignmentId: "e9a1b3c5-7f0b-4c4e-9a6d-8f0b2d4f6a03",
    workspaceId: "d6f8b0c2-4e5a-4d7f-8b9c-0e2a4c6e8b44",
    startedAt: -480,
    finishedAt: null,
    finalStatus: null,
    score: null,
    passed: null,
    actions: (session) => [
      action(session, -480, "SESSION_STARTED"),
      ...dispatcherCard(session, "c4a6c8e0-2f3b-4d5e-9a7c-9f1b3d5f7a14", -470, {
        openedAfter: 10,
        entries: [
          { after: 60, status: "ACCEPTED", comment: "Принято по компетенции 101" },
          { after: 290, status: "RESPONSE_STARTED", comment: "Выслано отделение ПСЧ-3" },
        ],
      }),
    ],
  }),
  individual(students.kovaleva, {
    sessionId: "d7f9b1c3-5e6a-4f0d-9c4e-6a8c0e2b4d54",
    assignmentId: "f0b2c4d6-8a1c-4d5f-8b7e-0a2c4e6a8b14",
    workspaceId: "e8a0c2d4-6f7b-4a1e-8d0f-2c4e6a8c0e55",
    startedAt: -540,
    finishedAt: -240,
    finalStatus: "ABORTED",
    score: "33.33",
    passed: null,
    actions: (session) => [
      action(session, -540, "SESSION_STARTED"),
      ...dispatcherCard(session, "c5b7d9f1-3a4c-4e6f-8b8d-0a2c4e6a8b15", -530, { openedAfter: 8 }),
      action(session, -240, "SESSION_ABORTED", { actor: null, details: { reason: "PRESENCE_TIMEOUT" } }),
    ],
  }),
  individual(students.guseva, {
    sessionId: "e9b1d3f5-7a8c-4b2e-8d6f-8c0e2a4c6e65",
    assignmentId: "a2c4e6f8-0b3d-4e7a-9c9f-2b4d6f8a0c24",
    workspaceId: "f0b2d4e6-8a9c-4c3f-9e1a-4e6a8c0e2a66",
    startedAt: -900,
    finishedAt: -60,
    finalStatus: "COMPLETED",
    score: "85.71",
    passed: false,
    actions: (session) => [
      action(session, -900, "SESSION_STARTED"),
      ...dispatcherCard(session, "c6c8e0a2-4b5d-4f7a-9c0e-2b4d6f8a0c16", -890, {
        openedAfter: 9,
        entries: [
          { after: 70, status: "ACCEPTED", comment: "Принято, выслан расчёт" },
          { after: 400, status: "WORK_COMPLETED", comment: "Возгорание ликвидировано" },
        ],
      }),
      action(session, -60, "SESSION_COMPLETED"),
    ],
  }),
  {
    sessionId: "f1c3e5a7-9b0d-4c4f-9e8a-0e2a4c6e8b76",
    assignmentId: sharedLesson.assignmentId,
    workspaceId: "a3c5e7f9-1b2d-4e5a-8f3c-6a8c0e2a4c77",
    lesson: sharedLesson,
    participants: [
      { ...students.orlov, positionCode: "101" },
      { ...students.timofeev, positionCode: "103" },
    ],
    startedAt: -180,
    finishedAt: null,
    finalStatus: null,
    score: null,
    passed: null,
    actions: (session) => {
      const cardId = "c7d9f1b3-5c6e-4a8b-8d2f-4c6e8a0c2e17";

      return [
        action(session, -180, "SESSION_STARTED", { actor: teacherId }),
        action(session, -170, "CARD_RELEASED", { actor: null, cardId }),
        action(session, -160, "CARD_OPENED", { actor: students.orlov.id, cardId, details: { service_id: fireServiceId } }),
        action(session, -140, "CARD_OPEN_DEADLINE_MISSED", {
          actor: null,
          cardId,
          details: { service_id: ambulanceServiceId, deadline_at: at(-140) },
        }),
        action(session, -120, "CARD_ACCEPTED", {
          actor: students.orlov.id,
          cardId,
          details: { service_id: fireServiceId, status: "ACCEPTED", comment: "Принято, высылаем АЦ" },
        }),
        action(session, -90, "CARD_OPENED", { actor: students.timofeev.id, cardId, details: { service_id: ambulanceServiceId } }),
      ];
    },
  },
];

const abortedByTeacher = new Map<string, { at: number; reason: string }>();

function statusOf(session: MockSession): string {
  const now = Date.now();

  if (abortedByTeacher.has(session.sessionId)) return "ABORTED";
  if (session.finalStatus !== null && session.finishedAt !== null && epoch + session.finishedAt * 1000 <= now) {
    return session.finalStatus;
  }

  return "RUNNING";
}

function visibleActions(session: MockSession): TrainingActionDto[] {
  const now = Date.now();
  const aborted = abortedByTeacher.get(session.sessionId);
  const own = session.actions(session).filter((item) => Date.parse(item.occurred_at) <= (aborted?.at ?? now));

  return aborted
    ? [...own, action(session, (aborted.at - epoch) / 1000, "SESSION_ABORTED", { actor: teacherId, details: { reason: aborted.reason } })]
    : own;
}

function snapshot(session: MockSession): TeacherMonitoringSessionDto {
  const status = statusOf(session);
  const actions = visibleActions(session);
  const released = actions.filter((item) => item.action_type === "CARD_RELEASED");
  const aborted = abortedByTeacher.get(session.sessionId);
  const completedAt = aborted ? new Date(aborted.at).toISOString() : status === "RUNNING" ? null : at(session.finishedAt ?? 0);
  const last = actions.at(-1);

  return {
    session_id: session.sessionId,
    assignment_id: session.assignmentId,
    assignment_batch_id: session.lesson.batchId,
    group_id: session.lesson.groupId,
    group_name: session.lesson.groupName,
    scenario_id: session.lesson.scenarioId,
    scenario_name: session.lesson.scenarioName,
    workspace_id: session.workspaceId,
    status,
    attempt_number: 1,
    started_at: at(session.startedAt),
    completed_at: completedAt,
    score: status === "RUNNING" ? null : session.score,
    passed: status === "COMPLETED" ? session.passed : null,
    expert_score: null,
    expert_passed: null,
    final_score: status === "RUNNING" ? null : session.score,
    final_passed: status === "COMPLETED" ? session.passed : null,
    cards_total: 2,
    cards_pending: 2 - released.length,
    cards_emitted: released.length,
    calls_total: 0,
    calls_pending: 0,
    calls_ringing: 0,
    calls_active: 0,
    calls_completed: 0,
    pending_card_keys: [],
    emitted_card_keys: released.map((_, index) => `card-${index + 1}`),
    successful_actions: actions.length,
    rejected_actions: 0,
    last_activity_at: last ? last.occurred_at : null,
    participants: session.participants.map((participant) => ({
      user_id: participant.id,
      display_name: participant.name,
      status,
      position_code: participant.positionCode,
      participant_role: "DDS",
    })),
  };
}

export function lessonMonitorSessionsMock(): TeacherMonitoringSessionDto[] {
  return sessions.map(snapshot);
}

export function lessonMonitorActionsMock(sessionId: string): TrainingActionDto[] | null {
  const session = sessions.find((item) => item.sessionId === sessionId);

  return session ? visibleActions(session) : null;
}

export function abortLessonMonitorSessionMock(sessionId: string, reason: string): boolean {
  const session = sessions.find((item) => item.sessionId === sessionId);

  if (!session || session.participants.length < 2 || statusOf(session) !== "RUNNING") return false;

  abortedByTeacher.set(sessionId, { at: Date.now(), reason });

  return true;
}
