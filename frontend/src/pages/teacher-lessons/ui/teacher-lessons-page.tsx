import { Alert, Anchor, Group, Paper, Select, Skeleton, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { Link } from "react-router-dom";
import { useSessionStore } from "@/entities/session";
import {
  AssignedCell,
  compareByNearestDue,
  completedAttemptsPhrase,
  lessonStatusLabels,
  lessonStatusTones,
  lessonStatusOrder,
  useTeacherLessons,
  WindowCell,
  type Lesson,
} from "@/features/teacher-lessons";
import { localDayKey, sortRows, useTableQuery } from "@/shared/lib";
import {
  Button,
  FilteredEmpty,
  LinkRow,
  SortableTh,
  TablePagination,
  tooltipEvents,
  usePagination,
  StatusPill,
} from "@/shared/ui";
import classes from "./teacher-lessons.module.scss";

const SORT_KEYS = ["name", "assigned", "due", "average", "status"] as const;
const FILTER_KEYS = ["status", "group", "from", "to", "startFrom", "startTo", "dueFrom", "dueTo"] as const;
const NO_GROUP = "none";
const ID_TAIL_LENGTH = 8;

const scoreFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

const statusOptions = Object.entries(lessonStatusLabels).map(([value, label]) => ({ value, label }));

function inDayRange(value: string | null, from: string | null, to: string | null): boolean {
  if (from === null && to === null) return true;
  if (value === null) return false;

  const day = localDayKey(value);

  return (from === null || day >= from) && (to === null || day <= to);
}

interface RangeFilterProps {
  label: string;
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
}

function RangeFilter({ label, from, to, onChange }: RangeFilterProps) {
  return (
    <DatePickerInput
      type="range"
      size="xs"
      w={230}
      placeholder={`${label}: любой период`}
      aria-label={`Фильтр по периоду: ${label.toLowerCase()}`}
      valueFormat="DD.MM.YYYY"
      value={[from, to]}
      onChange={([start, end]) => onChange(start, end)}
      clearable
      allowSingleDateInRange
    />
  );
}

function timeOf(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

function averageHint(lesson: Lesson): string {
  const average = lesson.average
    ? `Среднее ${completedAttemptsPhrase(lesson.average.count)}`
    : "Завершённых попыток с баллом нет";

  return `${average}. Прерванных попыток: ${lesson.abortedCount}, в среднее не входят.`;
}

function AverageCell({ lesson }: { lesson: Lesson }) {
  return (
    <Tooltip label={averageHint(lesson)} events={tooltipEvents} multiline w={260} color="povDark.6" radius={0}>
      {lesson.average ? (
        <Text size="sm" fw={600} tabIndex={0} className={`${classes.numeric} ${classes.focusable}`}>
          {scoreFormatter.format(lesson.average.value)}
        </Text>
      ) : (
        <Text size="sm" c="povDark2.6" tabIndex={0} className={classes.focusable}>
          нет данных
        </Text>
      )}
    </Tooltip>
  );
}

function LessonsTable({ lessons }: { lessons: Lesson[] }) {
  const table = useTableQuery("lessons", SORT_KEYS, FILTER_KEYS);
  const status = table.filter("status");
  const group = table.filter("group");
  const range = (fromKey: (typeof FILTER_KEYS)[number], toKey: (typeof FILTER_KEYS)[number]) => ({
    from: table.filter(fromKey),
    to: table.filter(toKey),
    onChange: (from: string | null, to: string | null) =>
      table.setFilters([
        [fromKey, from],
        [toKey, to],
      ]),
  });
  const assigned = range("from", "to");
  const start = range("startFrom", "startTo");
  const due = range("dueFrom", "dueTo");

  const visible = sortRows(
    lessons.filter(
      (lesson) =>
        (status === null || lesson.status === status) &&
        (group === null || (lesson.groupName ?? NO_GROUP) === group) &&
        inDayRange(lesson.assignedAt, assigned.from, assigned.to) &&
        inDayRange(lesson.availableFrom, start.from, start.to) &&
        inDayRange(lesson.dueAt, due.from, due.to),
    ),
    table.sort,
    {
      name: (lesson) => lesson.scenarioName,
      assigned: (lesson) => Date.parse(lesson.assignedAt),
      due: (lesson) => timeOf(lesson.dueAt),
      average: (lesson) => lesson.average?.value ?? null,
      status: (lesson) => lessonStatusOrder[lesson.status],
    },
    compareByNearestDue,
  );
  const pagination = usePagination(visible);
  const groupOptions = [...new Set(lessons.map((lesson) => lesson.groupName ?? NO_GROUP))].map((value) => ({
    value,
    label: value === NO_GROUP ? "Без группы" : value,
  }));

  return (
    <Stack gap="xs">
      <Group gap="sm" wrap="wrap">
        <Select
          size="xs"
          w={180}
          placeholder="Состояние: все"
          aria-label="Фильтр по состоянию"
          data={statusOptions}
          value={status}
          onChange={(value) => table.setFilter("status", value)}
          clearable
        />
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
        <RangeFilter label="Назначено" {...assigned} />
        <RangeFilter label="Начало" {...start} />
        <RangeFilter label="Срок" {...due} />
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
              <col width={150} />
              <col width={140} />
            </colgroup>
            <Table.Thead>
              <Table.Tr>
                <SortableTh
                  label="Название"
                  direction={table.directionOf("name")}
                  onSort={() => table.cycleSort("name")}
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
                  label="Средний балл"
                  direction={table.directionOf("average")}
                  onSort={() => table.cycleSort("average")}
                />
                <SortableTh
                  label="Состояние"
                  direction={table.directionOf("status")}
                  onSort={() => table.cycleSort("status")}
                />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagination.rows.map((lesson) => (
                <LinkRow key={lesson.id}>
                  <Table.Td>
                    <Tooltip
                      label={`${lesson.scenarioName} · …${lesson.id.slice(-ID_TAIL_LENGTH)}`}
                      events={tooltipEvents}
                      multiline
                      color="povDark.6"
                      radius={0}
                    >
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
                    <AverageCell lesson={lesson} />
                  </Table.Td>
                  <Table.Td>
                    <StatusPill tone={lessonStatusTones[lesson.status]}>{lessonStatusLabels[lesson.status]}</StatusPill>
                  </Table.Td>
                </LinkRow>
              ))}
            </Table.Tbody>
          </Table>
          <TablePagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        </Paper>
      )}
    </Stack>
  );
}

function Lessons({ teacherId }: { teacherId: string }) {
  const lessons = useTeacherLessons(teacherId);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Title order={2} size="h4" fw={600}>
          Занятия
        </Title>
        <Button size="sm" component={Link} to="/teacher/lessons/new">
          Назначить занятие
        </Button>
      </Group>

      {lessons.status === "pending" && (
        <Paper withBorder p="md">
          <Stack gap="xs">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} height={28} radius={2} />
            ))}
          </Stack>
        </Paper>
      )}

      {lessons.status === "error" && (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить занятия">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={lessons.retry}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {lessons.status === "success" && lessons.lessons.length === 0 && (
        <Paper withBorder p="md">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Занятий пока нет
            </Text>
            <Text size="sm" c="povDark2.6">
              Занятие — это сценарий, назначенный группе или обучаемому. Начните со списка сценариев,
              затем назначьте сценарий группе.
            </Text>
          </Stack>
        </Paper>
      )}

      {lessons.status === "success" && lessons.lessons.length > 0 && (
        <LessonsTable lessons={lessons.lessons} />
      )}
    </Stack>
  );
}

const TeacherLessonsPage = () => {
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  return <Lessons teacherId={teacherId} />;
};

export default TeacherLessonsPage;
