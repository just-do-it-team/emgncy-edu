import { useEffect, useRef, useState } from "react";
import { Alert, Anchor, Group, Paper, SegmentedControl, Skeleton, Stack, Text, Title } from "@mantine/core";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAssignments } from "@/entities/assignment";
import { useEmergencyServices } from "@/entities/emergency-service";
import { useSessionStore } from "@/entities/session";
import { useStudentNames } from "@/entities/student";
import { buildLessons, lessonStatusLabels, type Lesson } from "@/features/teacher-lessons";
import type { EmergencyService, MonitoredSession, TrainingActionDto } from "@/shared/api";
import { REACTION_NORMS_TEXT } from "@/shared/config";
import { formatClockTime, formatDayMonthTime } from "@/shared/lib";
import { Button, Fact } from "@/shared/ui";
import { useLiveActions, useLiveSessions } from "../api/use-live-monitor";
import { formatAgo, formatDuration } from "../model/format";
import {
  alarmFeed,
  byProblem,
  latestSessionOf,
  monitorCounts,
  monitorNorms,
  participantRow,
  serviceIdOf,
  type MonitorCounts,
  type MonitorParticipant,
  type ParticipantRow,
} from "@/entities/monitoring";
import { AlarmFeed } from "./alarm-feed";
import { ParticipantTiles } from "./participant-tiles";
import { ParticipantsTable } from "./participants-table";
import classes from "./lesson-monitor.module.scss";

const CLOCK_STEP_MS = 1000;
const SHARED_WORKSPACE = "SHARED";
const VIEW_PARAM = "view";
const TILES_VIEW = "tiles";
const FEED_VIEW = "feed";

const viewOptions = [
  { value: FEED_VIEW, label: "Лента" },
  { value: TILES_VIEW, label: "Плитки" },
];

/** Полноэкранный режим через Fullscreen API: выход по Esc обрабатывает браузер, состояние читается из события. */
function useFullscreen() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement !== null && document.fullscreenElement === ref.current);

    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  return {
    ref,
    active,
    supported: document.fullscreenEnabled,
    enter: () => void ref.current?.requestFullscreen().catch(() => undefined),
  };
}

const norms = monitorNorms;

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_STEP_MS);

    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function lessonParticipants(lesson: Lesson, names: Map<string, string> | undefined): MonitorParticipant[] {
  const byUser = new Map<string, MonitorParticipant>();

  for (const participant of lesson.assignments.flatMap((assignment) => assignment.participants)) {
    if (byUser.has(participant.userId)) continue;

    const snapshotName = lesson.sessions
      .flatMap((session) => session.participants)
      .find((item) => item.userId === participant.userId)?.displayName;

    byUser.set(participant.userId, {
      userId: participant.userId,
      name: snapshotName ?? names?.get(participant.userId) ?? `обучаемый ${participant.userId.slice(0, 8)}`,
      role: participant.role,
      positionCode: participant.positionCode,
    });
  }

  return [...byUser.values()];
}

function buildRows(
  participants: MonitorParticipant[],
  latest: Map<string, MonitoredSession | null>,
  actions: Map<string, TrainingActionDto[]>,
  services: Map<string, EmergencyService> | undefined,
  now: number,
): ParticipantRow[] {
  return participants
    .map((participant) => {
      const session = latest.get(participant.userId) ?? null;
      const dispatchers = session?.participants.filter((item) => item.positionCode !== null).length ?? 0;

      return participantRow(
        {
          participant,
          session,
          actions: session === null ? [] : (actions.get(session.sessionId) ?? []),
          serviceId: serviceIdOf(participant.positionCode, services),
          soleDispatcher: dispatchers === 1,
        },
        now,
        norms,
      );
    })
    .sort(byProblem(norms));
}

interface ConnectionProps {
  updatedAt: number;
  sessionsFailed: boolean;
  actionsFailed: boolean;
  now: number;
}

function Connection({ updatedAt, sessionsFailed, actionsFailed, now }: ConnectionProps) {
  if (sessionsFailed) {
    return (
      <Text size="sm" fw={600} className={classes.connectionLost} role="status">
        Нет связи с сервером. Данные на {formatClockTime(new Date(updatedAt))}, повторяем запрос
      </Text>
    );
  }

  return (
    <Text size="xs" c="povDark2.6" className={classes.numeric} role="status">
      Обновлено {formatAgo(now - updatedAt)}
      {actionsFailed ? "; журнал действий части обучаемых не загрузился, повторяем" : ""}
    </Text>
  );
}

function earliestStart(sessions: MonitoredSession[]): number | null {
  const starts = sessions.map((session) => Date.parse(session.startedAt));

  return starts.length === 0 ? null : Math.min(...starts);
}

interface MonitorHeaderProps {
  lesson: Lesson;
  counts: MonitorCounts;
  now: number;
  connection: ConnectionProps;
}

function MonitorHeader({ lesson, counts, now, connection }: MonitorHeaderProps) {
  const startedAt = earliestStart(lesson.sessions);

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
        <Stack gap={4}>
          <Title order={2} size="h4" fw={600}>
            {lesson.scenarioName}
          </Title>
          <Text size="sm">
            {lesson.groupName ?? "Без группы"} · {lessonStatusLabels[lesson.status]}
          </Text>
          <Text size="xs" c="povDark2.6">
            Нормативы реакции: {REACTION_NORMS_TEXT}
          </Text>
          <Connection {...connection} />
        </Stack>

        <Group gap="xl" align="flex-start" wrap="wrap">
          <Fact label="Прошло с начала">{startedAt === null ? "—" : formatDuration(now - startedAt)}</Fact>
          <Fact label="Идут">{counts.running}</Fact>
          <Fact label="Завершили">{counts.completed}</Fact>
          <Fact label="Прервали">{counts.aborted}</Fact>
          <Fact label="Не начали">{counts.notStarted}</Fact>
          <Button size="xs" variant="outline" color="povDark2.6" component={Link} to={`/teacher/lessons/${lesson.id}`}>
            Страница занятия
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}

function LessonNotice({ lesson, counts, now }: { lesson: Lesson; counts: MonitorCounts; now: number }) {
  const opensAt = lesson.availableFrom === null ? null : Date.parse(lesson.availableFrom);
  const resultsLink = (
    <Anchor component={Link} to={`/teacher/lessons/${lesson.id}`} size="sm" c="povDark2.6" underline="always">
      Итоги на странице занятия
    </Anchor>
  );

  if (lesson.status === "CANCELLED") {
    return (
      <Alert variant="outline" color="povDark2.6" title="Занятие отменено">
        {resultsLink}
      </Alert>
    );
  }

  if (lesson.sessions.length === 0 && opensAt !== null && opensAt > now) {
    return (
      <Alert variant="outline" color="povDark2.6" title={`До начала занятия ${formatDuration(opensAt - now)}`}>
        <Text size="sm">
          Занятие откроется {formatDayMonthTime(new Date(opensAt))}. Монитор начнёт показывать обучаемых, как только они
          приступят; страницу можно не обновлять.
        </Text>
      </Alert>
    );
  }

  if (lesson.sessions.length === 0) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Никто ещё не начал занятие">
        <Text size="sm">
          Обучаемые начинают попытку из своего кабинета. Строки ниже обновятся сами, когда кто-то приступит.
        </Text>
      </Alert>
    );
  }

  if (counts.running === 0 && counts.notStarted === 0) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Занятие завершено">
        <Text size="sm">Все участники завершили или прервали попытки. {resultsLink}</Text>
      </Alert>
    );
  }

  return null;
}

interface MonitorBodyProps {
  lesson: Lesson;
  teacherId: string;
  updatedAt: number;
  sessionsFailed: boolean;
}

function MonitorBody({ lesson, teacherId, updatedAt, sessionsFailed }: MonitorBodyProps) {
  const now = useNow();
  const students = useStudentNames(teacherId);
  const services = useEmergencyServices();
  const [seen, setSeen] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get(VIEW_PARAM) === TILES_VIEW ? TILES_VIEW : FEED_VIEW;
  const fullscreen = useFullscreen();

  const participants = lessonParticipants(lesson, students.data);
  const latest = new Map(participants.map((item) => [item.userId, latestSessionOf(item.userId, lesson.sessions)]));
  const watched = [
    ...new Map(
      [...latest.values()]
        .filter((session): session is MonitoredSession => session !== null && session.status !== "CREATED")
        .map((session) => [session.sessionId, session]),
    ).values(),
  ];
  const actions = useLiveActions(watched);
  const rows = buildRows(participants, latest, actions.bySession, services.data, now);
  const counts = monitorCounts(rows);
  const lateNow = rows.filter((row) => row.status === "running" && row.timer?.level === "overdue").length;
  const alarms = alarmFeed(rows);
  const names = new Map(rows.map((row) => [row.userId, row.name]));
  const sharedAssignments = new Set(
    lesson.assignments.filter((item) => item.workspaceMode === SHARED_WORKSPACE).map((item) => item.id),
  );
  const sharedSessions = new Set(
    watched.filter((session) => sharedAssignments.has(session.assignmentId)).map((session) => session.sessionId),
  );

  const openRow = (userId: string) => {
    setExpanded(userId);
    setHighlighted(userId);
    const row = document.getElementById(`monitor-row-${userId}`);

    row?.scrollIntoView({ block: "center" });
    row?.focus({ preventScroll: true });
  };

  return (
    <Stack gap="md">
      <MonitorHeader
        lesson={lesson}
        counts={counts}
        now={now}
        connection={{ updatedAt, sessionsFailed, actionsFailed: actions.failed, now }}
      />

      <LessonNotice lesson={lesson} counts={counts} now={now} />

      <Group justify="space-between" gap="sm" wrap="wrap">
        <SegmentedControl
          size="xs"
          radius={2}
          color="povDark2.6"
          data={viewOptions}
          value={view}
          aria-label="Вид монитора"
          onChange={(value) =>
            setSearchParams(
              (current) => {
                const next = new URLSearchParams(current);

                if (value === TILES_VIEW) next.set(VIEW_PARAM, TILES_VIEW);
                else next.delete(VIEW_PARAM);
                return next;
              },
              { replace: true },
            )
          }
        />
        {fullscreen.supported && (
          <Button size="xs" variant="outline" color="povDark2.6" onClick={fullscreen.enter}>
            Режим проектора
          </Button>
        )}
      </Group>

      <div ref={fullscreen.ref} className={fullscreen.active ? classes.projector : undefined} hidden={!fullscreen.active}>
        {fullscreen.active && (
          <Stack gap="md">
            <Group justify="space-between" wrap="wrap" gap="md">
              <Title order={2} size="h3" fw={600}>
                {lesson.scenarioName}
              </Title>
              <Text fw={700} className={classes.lateNow}>
                Опаздывают сейчас: {lateNow}
              </Text>
              <Text size="sm" c="povDark2.6">
                Выход — Esc
              </Text>
            </Group>
            <ParticipantTiles rows={rows} services={services.data} />
          </Stack>
        )}
      </div>

      {view === TILES_VIEW ? (
        <Stack gap="sm">
          <Text fw={600} className={classes.lateNow} role="status">
            Опаздывают сейчас: {lateNow}
          </Text>
          <ParticipantTiles rows={rows} services={services.data} />
        </Stack>
      ) : (
        <div className={classes.layout}>
          <AlarmFeed
            alarms={alarms}
            names={names}
            seen={seen}
            onSeen={(alarmId) => setSeen((current) => new Set(current).add(alarmId))}
            onOpen={openRow}
          />
          <ParticipantsTable
            rows={rows}
            now={now}
            teacherId={teacherId}
            sharedSessions={sharedSessions}
            names={names}
            services={services.data}
            actionsBySession={actions.bySession}
            expanded={expanded}
            highlighted={highlighted}
            onToggle={(userId) => {
              setHighlighted(null);
              setExpanded((current) => (current === userId ? null : userId));
            }}
          />
        </div>
      )}
    </Stack>
  );
}

function LessonMonitor({ teacherId, lessonId }: { teacherId: string; lessonId: string }) {
  const assignments = useAssignments({ assignedBy: teacherId });
  const sessions = useLiveSessions(teacherId);

  if (assignments.isPending || sessions.isPending) {
    return (
      <Stack gap="md">
        <Skeleton height={112} radius={2} />
        <Skeleton height={320} radius={2} />
      </Stack>
    );
  }

  if (assignments.isError || sessions.data === undefined) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить занятие">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
          <Button
            size="xs"
            variant="outline"
            color="povDark2.6"
            onClick={() => {
              if (assignments.isError) void assignments.refetch();
              if (sessions.isError) void sessions.refetch();
            }}
          >
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  const lesson = buildLessons(assignments.data, sessions.data).find((item) => item.id === lessonId);

  if (!lesson) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Занятие не найдено">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">Назначение удалено, относится к другому преподавателю или адрес неверный.</Text>
          <Anchor component={Link} to="/teacher/lessons" size="sm" c="povDark2.6" underline="always">
            К списку занятий
          </Anchor>
        </Stack>
      </Alert>
    );
  }

  return (
    <MonitorBody
      lesson={lesson}
      teacherId={teacherId}
      updatedAt={sessions.dataUpdatedAt}
      sessionsFailed={sessions.isError}
    />
  );
}

const TeacherLessonMonitorPage = () => {
  const { lessonId = "" } = useParams();
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  return <LessonMonitor teacherId={teacherId} lessonId={lessonId} />;
};

export default TeacherLessonMonitorPage;
