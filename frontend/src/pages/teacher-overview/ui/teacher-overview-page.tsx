import { Alert, Anchor, Group, Paper, Select, Skeleton, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { Link } from "react-router-dom";
import { useAssignments } from "@/entities/assignment";
import { useTeacherSessions } from "@/entities/monitoring";
import { useSessionStore } from "@/entities/session";
import { useStudentNames } from "@/entities/student";
import {
  AssignedCell,
  compareByNearestDue,
  participantsPhrase,
  useTeacherLessons,
  WindowCell,
  type Lesson,
} from "@/features/teacher-lessons";
import { formatDayMonthTime, localDayKey, sortRows, useTableQuery } from "@/shared/lib";
import type { ExpertAssessment, MonitoredSession } from "@/shared/api";
import { Button, FilteredEmpty, LinkRow, SortableTh, tooltipEvents } from "@/shared/ui";
import { TeacherAttemptsTable } from "@/widgets/teacher-attempts-table";
import classes from "./teacher-overview.module.scss";

const UPCOMING_LIMIT = 5;
const NO_TEACHER_ASSESSMENTS = new Map<string, ExpertAssessment>();

const UPCOMING_SORT_KEYS = ["lesson", "assigned", "due", "participants"] as const;
const UPCOMING_FILTER_KEYS = ["group"] as const;
const NO_GROUP = "none";

function timeOf(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

function ParticipantsCell({ lesson, names }: { lesson: Lesson; names: Map<string, string> | undefined }) {
  const list = lesson.participantIds
    .map((id) => names?.get(id) ?? `обучаемый ${id.slice(0, 8)}`)
    .join("\n");

  return (
    <Tooltip
      label={list || "Участников нет"}
      events={tooltipEvents}
      multiline
      color="povDark.6"
      radius={0}
      classNames={{ tooltip: classes.tooltipList }}
    >
      <Text size="sm" tabIndex={0} className={`${classes.numeric} ${classes.focusable}`}>
        {participantsPhrase(lesson.participantIds.length)}
      </Text>
    </Tooltip>
  );
}

function UpcomingTable({ lessons, names }: { lessons: Lesson[]; names: Map<string, string> | undefined }) {
  const table = useTableQuery("upcoming", UPCOMING_SORT_KEYS, UPCOMING_FILTER_KEYS);
  const group = table.filter("group");
  const planned = lessons.filter((lesson) => lesson.status === "PLANNED");
  const visible = sortRows(
    planned.filter((lesson) => group === null || (lesson.groupName ?? NO_GROUP) === group),
    table.sort,
    {
      lesson: (lesson) => lesson.scenarioName,
      assigned: (lesson) => Date.parse(lesson.assignedAt),
      due: (lesson) => timeOf(lesson.dueAt),
      participants: (lesson) => lesson.participantIds.length,
    },
    compareByNearestDue,
  ).slice(0, UPCOMING_LIMIT);
  const groupOptions = [...new Set(planned.map((lesson) => lesson.groupName ?? NO_GROUP))].map((value) => ({
    value,
    label: value === NO_GROUP ? "Без группы" : value,
  }));

  if (planned.length === 0) {
    return (
      <Paper withBorder p="md">
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            Предстоящих занятий нет
          </Text>
          <Text size="sm" c="povDark2.6">
            Занятие появится здесь, когда вы назначите сценарий группе или обучаемому. Список
            сценариев — в разделе{" "}
            <Anchor component={Link} to="/teacher/scenarios" size="sm" c="povDark2.6" underline="always">
              «Сценарии»
            </Anchor>
            .
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack gap="xs">
      <Group gap="sm">
        <Select
          size="xs"
          w={220}
          placeholder="Группа: все"
          aria-label="Фильтр по группе"
          data={groupOptions}
          value={group}
          onChange={(value) => table.setFilter("group", value)}
          clearable
        />
      </Group>
      {visible.length === 0 ? (
        <FilteredEmpty onReset={table.resetFilters} />
      ) : (
        <Paper withBorder>
          <Table verticalSpacing="sm" highlightOnHover layout="fixed">
            <colgroup>
              <col />
              <col width={200} />
              <col width={130} />
              <col width={120} />
              <col width={120} />
              <col width={130} />
            </colgroup>
            <Table.Thead>
              <Table.Tr>
                <SortableTh
                  label="Занятие"
                  direction={table.directionOf("lesson")}
                  onSort={() => table.cycleSort("lesson")}
                />
                <Table.Th>Группа</Table.Th>
                <SortableTh
                  label="Назначено"
                  direction={table.directionOf("assigned")}
                  onSort={() => table.cycleSort("assigned")}
                />
                <SortableTh
                  label="Выполнить"
                  colSpan={2}
                  hint="Сортировка по сроку выполнения"
                  direction={table.directionOf("due")}
                  onSort={() => table.cycleSort("due")}
                />
                <SortableTh
                  label="Участники"
                  direction={table.directionOf("participants")}
                  onSort={() => table.cycleSort("participants")}
                />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visible.map((lesson) => (
                <LinkRow key={lesson.id}>
                  <Table.Td>
                    <Tooltip label={lesson.scenarioName} events={tooltipEvents} multiline color="povDark.6" radius={0}>
                      <Anchor
                        component={Link}
                        to={`/teacher/lessons/${lesson.id}`}
                        size="sm"
                        c="povDark2.6"
                        underline="never"
                        data-row-link
                        className={classes.truncatedLink}
                      >
                        {lesson.scenarioName}
                      </Anchor>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={1} c={lesson.groupName ? undefined : "povDark2.6"}>
                      {lesson.groupName ?? "Без группы"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <AssignedCell value={lesson.assignedAt} />
                  </Table.Td>
                  <Table.Td>
                    <WindowCell prefix="с" value={lesson.availableFrom} />
                  </Table.Td>
                  <Table.Td>
                    <WindowCell prefix="до" value={lesson.dueAt} />
                  </Table.Td>
                  <Table.Td>
                    <ParticipantsCell lesson={lesson} names={names} />
                  </Table.Td>
                </LinkRow>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

function UpcomingLessons({ teacherId }: { teacherId: string }) {
  const lessons = useTeacherLessons(teacherId);
  const students = useStudentNames(teacherId);

  if (lessons.status === "pending") return <Skeleton height={120} radius={2} />;

  if (lessons.status === "error") {
    return (
      <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить предстоящие занятия">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={lessons.retry}>
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  return <UpcomingTable lessons={lessons.lessons} names={students.data} />;
}

function lessonIdOf(session: MonitoredSession): string {
  return session.batchId ?? session.assignmentId;
}

interface OverviewProps {
  teacherId: string;
}

function Overview({ teacherId }: OverviewProps) {
  const running = useTeacherSessions(teacherId, "RUNNING");
  const attempts = useTeacherSessions(teacherId, "ANY");
  const assignments = useAssignments({ assignedBy: teacherId });
  const assignmentsById = assignments.data && new Map(assignments.data.map((item) => [item.id, item]));

  const runningLessons = [
    ...new Map((running.data ?? []).map((session) => [lessonIdOf(session), session])).entries(),
  ];
  const today = localDayKey(new Date());
  const todayAttempts = (attempts.data ?? []).filter(
    (session) => session.completedAt !== null && localDayKey(session.completedAt) === today,
  );

  return (
    <Stack gap="md">
      {running.isPending && <Skeleton height={76} radius={2} />}

      {running.isError && (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить идущие занятия">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => running.refetch()}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {running.isSuccess && (
        <Paper withBorder p="md">
          {runningLessons.length > 0 ? (
            <Stack gap="md">
              <Text size="xs" c="povDark2.6">
                Идут занятия: {runningLessons.length}
              </Text>
              {runningLessons.map(([lessonId, session]) => (
                <Group key={lessonId} justify="space-between" align="flex-start" wrap="wrap" gap="md">
                  <Stack gap={4}>
                    <Title order={2} size="h4" fw={600}>
                      {session.scenarioName}
                    </Title>
                    <Text size="sm">
                      {session.groupName ?? "Без группы"} · начато {formatDayMonthTime(session.startedAt)}
                    </Text>
                  </Stack>
                  <Button size="xs" component={Link} to={`/teacher/monitor/${lessonId}`}>
                    Монитор
                  </Button>
                </Group>
              ))}
            </Stack>
          ) : (
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  Активного занятия нет
                </Text>
                <Text size="sm" c="povDark2.6">
                  Монитор открывается, когда занятие идёт. Запланированные и прошедшие занятия — в
                  разделе «Занятия».
                </Text>
              </Stack>
              <Anchor component={Link} to="/teacher/lessons" size="sm" c="povDark2.6" underline="always">
                К списку занятий
              </Anchor>
            </Group>
          )}
        </Paper>
      )}

      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Предстоящие занятия
        </Title>
        <UpcomingLessons teacherId={teacherId} />
      </Stack>

      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Попытки за сегодня
        </Title>

        <TeacherAttemptsTable
          query={attempts}
          sessions={todayAttempts}
          assessments={NO_TEACHER_ASSESSMENTS}
          assignments={assignmentsById}
          queryPrefix="today"
          showGroup
          emptyTitle="Сегодня завершённых попыток нет"
          emptyHint="Попытки появятся, когда участники завершат занятия. Прошедшие попытки — в разделе «Обучаемые»."
        />
      </Stack>
    </Stack>
  );
}

const TeacherOverviewPage = () => {
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  return <Overview teacherId={teacherId} />;
};

export default TeacherOverviewPage;
