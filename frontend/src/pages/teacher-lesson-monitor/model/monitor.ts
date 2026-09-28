import type { MonitoredSession, ParticipantRole, TrainingActionDto } from "@/shared/api";

export interface MonitorNorms {
  openMs: number;
  firstEntryMs: number;
  idleMs: number;
  warningRatio: number;
}

export type AlarmKind = "open_norm" | "first_entry_norm" | "idle" | "aborted";

export type AlarmSeverity = "high" | "medium" | "low";

export interface MonitorAlarm {
  id: string;
  kind: AlarmKind;
  severity: AlarmSeverity;
  at: number;
  sessionId: string;
  userId: string;
  elementLabel: string | null;
  detail: string;
}

export type TimerLevel = "ok" | "near" | "overdue" | "none";

export type TimerPhase = "open" | "first_entry";

export interface ElementTimer {
  elementLabel: string;
  elapsedMs: number;
  limitMs: number | null;
  phase: TimerPhase | null;
  level: TimerLevel;
}

export type RowStatus = "not_started" | "running" | "completed" | "aborted";

export interface MonitorParticipant {
  userId: string;
  name: string;
  role: ParticipantRole;
  positionCode: string | null;
}

export interface ParticipantRow extends MonitorParticipant {
  session: MonitoredSession | null;
  status: RowStatus;
  timer: ElementTimer | null;
  actionCount: number;
  lastActionAt: number | null;
  idleMs: number | null;
  violations: number;
  alarms: MonitorAlarm[];
}

export interface ParticipantInput {
  participant: MonitorParticipant;
  session: MonitoredSession | null;
  actions: TrainingActionDto[];
  serviceId: string | null;
  soleDispatcher: boolean;
}

interface Element {
  key: string;
  label: string;
  appearedAt: number;
  openedAt: number | null;
  firstEntryAt: number | null;
  normed: boolean;
  finished: boolean;
}

const RUNNING = "RUNNING";
const ABORT_STATUSES = new Set(["ABORTED", "TIMED_OUT"]);
const DECISION_ACTIONS = new Set(["CARD_ACCEPTED", "CARD_REJECTED", "SERVICE_STATUS_CHANGED"]);
const FINISHED_RESPONSE_STATUSES = new Set(["WORK_COMPLETED", "WORK_REFUSED", "REJECTED"]);
const PRESENCE_TIMEOUT = "PRESENCE_TIMEOUT";

const severityOf: Record<AlarmKind, AlarmSeverity> = {
  open_norm: "medium",
  first_entry_norm: "high",
  idle: "low",
  aborted: "high",
};

function timeOf(action: TrainingActionDto): number {
  return Date.parse(action.occurred_at);
}

function detailText(action: TrainingActionDto, key: string): string | null {
  const value = action.details[key];

  return typeof value === "string" ? value : null;
}

function hasComment(action: TrainingActionDto): boolean {
  return (detailText(action, "comment") ?? "").trim().length > 0;
}

function responseStatusOf(action: TrainingActionDto): string | null {
  if (action.action_type === "CARD_ACCEPTED") return "ACCEPTED";
  if (action.action_type === "CARD_REJECTED") return "REJECTED";

  return detailText(action, "status");
}

export function rowStatusOf(session: MonitoredSession | null): RowStatus {
  if (session === null || session.status === "CREATED") return "not_started";
  if (session.status === RUNNING) return "running";
  if (ABORT_STATUSES.has(session.status)) return "aborted";

  return "completed";
}

function cardElement(
  release: TrainingActionDto,
  label: string,
  actions: TrainingActionDto[],
  serviceId: string | null,
  soleDispatcher: boolean,
): Element {
  const cardId = release.incident_card_id ?? release.id;
  const cardActions = actions.filter((action) => action.incident_card_id === cardId);
  const serviceActions = cardActions.filter((action) => typeof action.details.service_id === "string");
  const own = serviceActions.filter((action) => serviceId !== null && action.details.service_id === serviceId);
  const normed = serviceId !== null && (own.length > 0 || (serviceActions.length === 0 && soleDispatcher));
  const opened = own.find((action) => action.action_type === "CARD_OPENED");
  const firstEntry = own.find((action) => DECISION_ACTIONS.has(action.action_type) && hasComment(action));
  const lastStatus = own
    .filter((action) => DECISION_ACTIONS.has(action.action_type))
    .map(responseStatusOf)
    .at(-1);

  return {
    key: cardId,
    label,
    appearedAt: timeOf(release),
    openedAt: opened ? timeOf(opened) : null,
    firstEntryAt: firstEntry ? timeOf(firstEntry) : null,
    normed,
    finished: lastStatus !== undefined && lastStatus !== null && FINISHED_RESPONSE_STATUSES.has(lastStatus),
  };
}

function elementKey(action: TrainingActionDto): string | null {
  if (action.result !== "SUCCESS") return null;
  if (action.action_type === "CARD_RELEASED") return action.incident_card_id;
  if (action.action_type === "INCOMING_CALL_RINGING") return action.entity_id;

  return null;
}

export function elementLabels(actions: TrainingActionDto[]): Map<string, string> {
  const labels = new Map<string, string>();
  let cards = 0;
  let calls = 0;

  for (const action of actions) {
    const key = elementKey(action);

    if (key === null || labels.has(key)) continue;
    if (action.action_type === "CARD_RELEASED") labels.set(key, `Карточка ${(cards += 1)}`);
    else labels.set(key, `Звонок ${(calls += 1)}`);
  }

  return labels;
}

function elementsOf(input: ParticipantInput): Element[] {
  const actions = input.actions.filter((action) => action.result === "SUCCESS");
  const labels = elementLabels(actions);

  return actions.flatMap((action): Element[] => {
    const key = elementKey(action);
    const label = key === null ? undefined : labels.get(key);

    if (key === null || label === undefined) return [];

    if (action.action_type === "CARD_RELEASED") {
      return [cardElement(action, label, actions, input.serviceId, input.soleDispatcher)];
    }

    return [
      {
        key,
        label,
        appearedAt: timeOf(action),
        openedAt: null,
        firstEntryAt: null,
        normed: false,
        finished: actions.some((item) => item.action_type === "INCOMING_CALL_COMPLETED" && item.entity_id === key),
      },
    ];
  });
}

function sessionEnd(session: MonitoredSession, now: number): number {
  return session.completedAt === null ? now : Math.min(now, Date.parse(session.completedAt));
}

function normAlarms(element: Element, input: ParticipantInput, session: MonitoredSession, now: number, norms: MonitorNorms): MonitorAlarm[] {
  if (!element.normed) return [];

  const end = sessionEnd(session, now);
  const checks: { kind: AlarmKind; doneAt: number | null; limitMs: number; detail: string }[] = [
    { kind: "open_norm", doneAt: element.openedAt, limitMs: norms.openMs, detail: `карточка не открыта за ${norms.openMs / 1000} с` },
    {
      kind: "first_entry_norm",
      doneAt: element.firstEntryAt,
      limitMs: norms.firstEntryMs,
      detail: `нет первой записи (статус + текст) за ${norms.firstEntryMs / 60_000} мин`,
    },
  ];

  return checks.flatMap((check) => {
    const deadline = element.appearedAt + check.limitMs;

    if ((check.doneAt ?? end) <= deadline) return [];

    return [
      {
        id: `${check.kind}:${session.sessionId}:${input.participant.userId}:${element.key}`,
        kind: check.kind,
        severity: severityOf[check.kind],
        at: deadline,
        sessionId: session.sessionId,
        userId: input.participant.userId,
        elementLabel: element.label,
        detail: check.doneAt === null ? check.detail : `${check.detail}, выполнено с опозданием`,
      },
    ];
  });
}

export function abortCause(action: TrainingActionDto | undefined, userId: string): string {
  const reason = action ? detailText(action, "reason") : null;

  if (reason === PRESENCE_TIMEOUT) return "потеря связи с тренажёром, попытка прервана автоматически";
  if (action && action.actor_user_id === userId) return "обучаемый прервал попытку";
  if (reason !== null) return `прервана преподавателем: ${reason}`;

  return "попытка прервана";
}

function abortAlarm(input: ParticipantInput, session: MonitoredSession): MonitorAlarm[] {
  if (!ABORT_STATUSES.has(session.status)) return [];

  const action = input.actions.find((item) => item.action_type === "SESSION_ABORTED");
  const at = action ? timeOf(action) : Date.parse(session.completedAt ?? session.startedAt);

  return [
    {
      id: `aborted:${session.sessionId}:${input.participant.userId}`,
      kind: "aborted",
      severity: severityOf.aborted,
      at,
      sessionId: session.sessionId,
      userId: input.participant.userId,
      elementLabel: null,
      detail: session.status === "TIMED_OUT" ? "истекло время попытки" : abortCause(action, input.participant.userId),
    },
  ];
}

function lastOwnActionAt(input: ParticipantInput): number | null {
  const own = input.actions.filter((action) => action.actor_user_id === input.participant.userId);

  return own.length === 0 ? null : Math.max(...own.map(timeOf));
}

function idleAlarm(input: ParticipantInput, session: MonitoredSession, since: number, now: number, norms: MonitorNorms): MonitorAlarm[] {
  if (session.status !== RUNNING || now - since < norms.idleMs) return [];

  return [
    {
      id: `idle:${session.sessionId}:${input.participant.userId}:${since}`,
      kind: "idle",
      severity: severityOf.idle,
      at: since + norms.idleMs,
      sessionId: session.sessionId,
      userId: input.participant.userId,
      elementLabel: null,
      detail: `нет действий ${Math.floor((now - since) / 60_000)} мин`,
    },
  ];
}

export function timerLevel(elapsedMs: number, limitMs: number | null, warningRatio: number): TimerLevel {
  if (limitMs === null) return "none";
  if (elapsedMs > limitMs) return "overdue";
  if (elapsedMs >= limitMs * warningRatio) return "near";

  return "ok";
}

function currentTimer(elements: Element[], session: MonitoredSession, now: number, norms: MonitorNorms): ElementTimer | null {
  if (session.status !== RUNNING) return null;

  const current = elements.filter((element) => !element.finished).at(-1);

  if (!current) return null;

  const elapsedMs = Math.max(0, now - current.appearedAt);
  const phase: TimerPhase | null = !current.normed
    ? null
    : current.openedAt === null
      ? "open"
      : current.firstEntryAt === null
        ? "first_entry"
        : null;
  const limitMs = phase === "open" ? norms.openMs : phase === "first_entry" ? norms.firstEntryMs : null;

  return { elementLabel: current.label, elapsedMs, limitMs, phase, level: timerLevel(elapsedMs, limitMs, norms.warningRatio) };
}

export function participantRow(input: ParticipantInput, now: number, norms: MonitorNorms): ParticipantRow {
  const { participant, session } = input;
  const status = rowStatusOf(session);

  if (session === null || status === "not_started") {
    return {
      ...participant,
      session,
      status,
      timer: null,
      actionCount: 0,
      lastActionAt: null,
      idleMs: null,
      violations: 0,
      alarms: [],
    };
  }

  const elements = elementsOf(input);
  const lastActionAt = lastOwnActionAt(input);
  const since = lastActionAt ?? Date.parse(session.startedAt);
  const violations = elements.flatMap((element) => normAlarms(element, input, session, now, norms));
  const alarms = [...violations, ...abortAlarm(input, session), ...idleAlarm(input, session, since, now, norms)];

  return {
    ...participant,
    session,
    status,
    timer: currentTimer(elements, session, now, norms),
    actionCount: input.actions.filter((action) => action.actor_user_id === participant.userId).length,
    lastActionAt,
    idleMs: status === "running" ? Math.max(0, now - since) : null,
    violations: violations.length,
    alarms,
  };
}

export function alarmFeed(rows: ParticipantRow[]): MonitorAlarm[] {
  return rows.flatMap((row) => row.alarms).sort((first, second) => second.at - first.at);
}

function problemGroup(row: ParticipantRow, norms: MonitorNorms): number {
  const idle = row.idleMs !== null && row.idleMs >= norms.idleMs;

  if (row.status === "running" && (row.timer?.level === "overdue" || idle)) return 0;
  if (row.status === "running" && row.violations > 0) return 1;
  if (row.status === "running" && row.timer?.level === "near") return 2;
  if (row.status === "running") return 3;
  if (row.status === "aborted") return 4;
  if (row.status === "not_started") return 5;

  return 6;
}

export function byProblem(norms: MonitorNorms): (first: ParticipantRow, second: ParticipantRow) => number {
  return (first, second) =>
    problemGroup(first, norms) - problemGroup(second, norms) ||
    second.violations - first.violations ||
    (second.idleMs ?? 0) - (first.idleMs ?? 0) ||
    first.name.localeCompare(second.name, "ru");
}

export interface MonitorCounts {
  running: number;
  completed: number;
  aborted: number;
  notStarted: number;
}

export function monitorCounts(rows: ParticipantRow[]): MonitorCounts {
  const count = (status: RowStatus) => rows.filter((row) => row.status === status).length;

  return {
    running: count("running"),
    completed: count("completed"),
    aborted: count("aborted"),
    notStarted: count("not_started"),
  };
}

export function latestSessionOf(userId: string, sessions: MonitoredSession[]): MonitoredSession | null {
  return sessions
    .filter((session) => session.participants.some((participant) => participant.userId === userId))
    .reduce<MonitoredSession | null>(
      (latest, session) =>
        latest === null || Date.parse(session.startedAt) > Date.parse(latest.startedAt) ? session : latest,
      null,
    );
}

export function pollingDelay(baseMs: number, state: { hidden: boolean; active: boolean }): number | false {
  return state.hidden || !state.active ? false : baseMs;
}
