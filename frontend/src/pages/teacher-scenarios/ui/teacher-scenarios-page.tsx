import { useState } from "react";
import { Alert, Anchor, Group, Paper, Select, Skeleton, Stack, Table, Text, TextInput, Tooltip } from "@mantine/core";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useAssignments } from "@/entities/assignment";
import {
  difficultyLabel,
  difficultyLevel,
  difficultyOptions,
  resolvedScenarioRole,
  scenarioRoleHint,
  scenarioRoleLabels,
  scenarioStatusLabels,
  useScenarios,
  type ScenarioRole,
} from "@/entities/scenario";
import { useSessionStore } from "@/entities/session";
import type { ScenarioListItem, ScenarioStatus, TeacherAssignment } from "@/shared/api";
import { formatShortDateTime, sortRows, useTableQuery } from "@/shared/lib";
import {
  Button,
  FilteredEmpty,
  LinkRow,
  SortableTh,
  TablePagination,
  tooltipEvents,
  usePagination,
} from "@/shared/ui";
import { ScenarioLibraryTabs } from "@/widgets/scenario-library-tabs";
import { ProceduralScenarioModal } from "./procedural-scenario-modal";
import classes from "./teacher-scenarios.module.scss";

const SORT_KEYS = ["name", "difficulty", "status", "author", "items", "used", "updated"] as const;
const FILTER_KEYS = ["q", "role", "difficulty", "status", "author", "usage"] as const;

const ALL_STATUSES = "ALL";
const OWN = "own";
const USED = "used";
const UNUSED = "unused";

const statusOrder: Record<ScenarioStatus, number> = { DRAFT: 0, PUBLISHED: 1, ARCHIVED: 2 };

const roleOptions = Object.entries(scenarioRoleLabels).map(([value, label]) => ({ value, label }));

const statusOptions = [
  ...Object.entries(scenarioStatusLabels).map(([value, label]) => ({ value, label })),
  { value: ALL_STATUSES, label: "Все, включая архив" },
];

const authorOptions = [{ value: OWN, label: "Мои" }];

const usageOptions = [
  { value: USED, label: "Используются в моих занятиях" },
  { value: UNUSED, label: "Не используются" },
];

interface ScenarioRow {
  scenario: ScenarioListItem;
  role: ScenarioRole | null;
  roleDerived: boolean;
  own: boolean;
  lessons: number | null;
}

function lessonsByScenario(assignments: TeacherAssignment[]): Map<string, number> {
  const lessons = new Map<string, Set<string>>();

  for (const assignment of assignments) {
    const ids = lessons.get(assignment.scenarioId) ?? new Set<string>();

    ids.add(assignment.batchId ?? assignment.id);
    lessons.set(assignment.scenarioId, ids);
  }

  return new Map([...lessons].map(([scenarioId, ids]) => [scenarioId, ids.size]));
}

function matchesStatus(status: ScenarioStatus, filter: string | null): boolean {
  if (filter === ALL_STATUSES) return true;
  if (filter === null) return status !== "ARCHIVED";

  return status === filter;
}

function matchesUsage(lessons: number | null, filter: string | null): boolean {
  if (filter === null || lessons === null) return filter === null;

  return filter === USED ? lessons > 0 : lessons === 0;
}

function ScenariosTable({ rows }: { rows: ScenarioRow[] }) {
  const table = useTableQuery("scenarios", SORT_KEYS, FILTER_KEYS);
  const query = table.filter("q")?.trim().toLocaleLowerCase("ru") ?? "";
  const role = table.filter("role");
  const difficulty = table.filter("difficulty");
  const status = table.filter("status");
  const author = table.filter("author");
  const usage = table.filter("usage");

  const visible = sortRows(
    rows.filter(
      (row) =>
        (query === "" || row.scenario.name.toLocaleLowerCase("ru").includes(query)) &&
        (role === null || row.role === role) &&
        (difficulty === null || String(difficultyLevel(row.scenario.difficulty)) === difficulty) &&
        matchesStatus(row.scenario.status, status) &&
        (author === null || row.own) &&
        matchesUsage(row.lessons, usage),
    ),
    table.sort,
    {
      name: (row) => row.scenario.name,
      difficulty: (row) => difficultyLevel(row.scenario.difficulty),
      status: (row) => statusOrder[row.scenario.status],
      author: (row) => (row.own ? 0 : 1),
      items: (row) => row.scenario.itemsCount,
      used: (row) => row.lessons,
      updated: (row) => Date.parse(row.scenario.updatedAt),
    },
    (first, second) => Date.parse(second.scenario.updatedAt) - Date.parse(first.scenario.updatedAt),
  );
  const pagination = usePagination(visible);

  return (
    <Stack gap="xs">
      <Group gap="sm" wrap="wrap">
        <TextInput
          size="xs"
          w={220}
          placeholder="Поиск по названию"
          aria-label="Поиск по названию"
          leftSection={<Search size={14} aria-hidden="true" />}
          value={table.filter("q") ?? ""}
          onChange={(event) => table.setFilter("q", event.currentTarget.value)}
        />
        <Select
          size="xs"
          w={130}
          placeholder="Роль: все"
          aria-label="Фильтр по роли"
          data={roleOptions}
          value={role}
          onChange={(value) => table.setFilter("role", value)}
          clearable
        />
        <Select
          size="xs"
          w={160}
          placeholder="Сложность: любая"
          aria-label="Фильтр по сложности"
          data={difficultyOptions}
          value={difficulty}
          onChange={(value) => table.setFilter("difficulty", value)}
          clearable
        />
        <Select
          size="xs"
          w={180}
          placeholder="Статус: кроме архива"
          aria-label="Фильтр по статусу"
          data={statusOptions}
          value={status}
          onChange={(value) => table.setFilter("status", value)}
          clearable
        />
        <Select
          size="xs"
          w={130}
          placeholder="Автор: все"
          aria-label="Фильтр по автору"
          data={authorOptions}
          value={author}
          onChange={(value) => table.setFilter("author", value)}
          clearable
        />
        <Select
          size="xs"
          w={230}
          placeholder="Использование: любое"
          aria-label="Фильтр по использованию в моих занятиях"
          data={usageOptions}
          value={usage}
          onChange={(value) => table.setFilter("usage", value)}
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
              <col width={110} />
              <col width={140} />
              <col width={120} />
              <col width={120} />
              <col width={110} />
              <col width={150} />
              <col width={130} />
            </colgroup>
            <Table.Thead>
              <Table.Tr>
                <SortableTh
                  label="Название"
                  direction={table.directionOf("name")}
                  onSort={() => table.cycleSort("name")}
                />
                <Table.Th>
                  <Tooltip label={scenarioRoleHint} events={tooltipEvents} multiline w={260} color="povDark.6" radius={0}>
                    <span tabIndex={0} className={classes.focusable}>
                      Роль
                    </span>
                  </Tooltip>
                </Table.Th>
                <SortableTh
                  label="Сложность"
                  direction={table.directionOf("difficulty")}
                  onSort={() => table.cycleSort("difficulty")}
                />
                <SortableTh
                  label="Статус"
                  direction={table.directionOf("status")}
                  onSort={() => table.cycleSort("status")}
                />
                <SortableTh
                  label="Автор"
                  direction={table.directionOf("author")}
                  onSort={() => table.cycleSort("author")}
                />
                <SortableTh
                  label="Элементов"
                  direction={table.directionOf("items")}
                  onSort={() => table.cycleSort("items")}
                />
                <SortableTh
                  label="В моих занятиях"
                  direction={table.directionOf("used")}
                  onSort={() => table.cycleSort("used")}
                />
                <SortableTh
                  label="Обновлён"
                  direction={table.directionOf("updated")}
                  onSort={() => table.cycleSort("updated")}
                />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagination.rows.map(({ scenario, role: rowRole, roleDerived, own, lessons }) => (
                <LinkRow key={scenario.id}>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/teacher/scenarios/${scenario.id}`}
                      size="sm"
                      c="povDark2.6"
                      underline="never"
                      data-row-link
                      className={classes.truncatedLink}
                    >
                      {scenario.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{rowRole === null ? "—" : scenarioRoleLabels[rowRole]}</Text>
                    {rowRole !== null && roleDerived && (
                      <Text size="xs" c="povDark2.6">
                        определено по составу
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{difficultyLabel(scenario.difficulty)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{scenarioStatusLabels[scenario.status]}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={2} c={own ? undefined : "povDark2.6"}>
                      {own ? "Вы" : (scenario.createdByName ?? "Другой преподаватель")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className={classes.numeric}>
                      {scenario.itemsCount}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className={classes.numeric}>
                      {lessons ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className={classes.numeric}>
                      {formatShortDateTime(scenario.updatedAt)}
                    </Text>
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

function Scenarios({ teacherId }: { teacherId: string }) {
  const scenarios = useScenarios();
  const assignments = useAssignments({ assignedBy: teacherId });
  const lessons = assignments.data && lessonsByScenario(assignments.data);
  const [procedural, setProcedural] = useState(false);
  const rows: ScenarioRow[] = (scenarios.data ?? []).map((scenario) => {
    const { role, derived } = resolvedScenarioRole(scenario.requiredPositions, scenario.composition);

    return {
      scenario,
      role,
      roleDerived: derived,
      own: scenario.createdBy === teacherId,
      lessons: lessons ? (lessons.get(scenario.id) ?? 0) : null,
    };
  });

  return (
    <Stack gap="md">
      <ScenarioLibraryTabs
        active="scenarios"
        actions={
          <Group gap="xs">
            <Button size="sm" variant="outline" color="povDark2.6" component={Link} to="/teacher/scenarios/new?ai=1">
              Сгенерировать с ИИ
            </Button>
            <Button size="sm" variant="outline" color="povDark2.6" onClick={() => setProcedural(true)}>
              Создать процедурный сценарий
            </Button>
            <Button size="sm" component={Link} to="/teacher/scenarios/new">
              Создать сценарий
            </Button>
          </Group>
        }
      />

      {scenarios.isPending && (
        <Paper withBorder p="md">
          <Stack gap="xs">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} height={28} radius={2} />
            ))}
          </Stack>
        </Paper>
      )}

      {scenarios.isError && (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить сценарии">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => scenarios.refetch()}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {assignments.isError && scenarios.isSuccess && (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить ваши занятия">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Колонка «В моих занятиях» и фильтр по использованию недоступны.</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => assignments.refetch()}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {scenarios.isSuccess && scenarios.data.length === 0 && (
        <Paper withBorder p="md">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Сценариев пока нет
            </Text>
            <Text size="sm" c="povDark2.6">
              Сценарий — набор звонков и карточек с эталоном, по которому сервер оценивает работу
              обучаемого. Когда сценарий появится, его можно будет утвердить и назначить группе.
            </Text>
          </Stack>
        </Paper>
      )}

      {scenarios.isSuccess && scenarios.data.length > 0 && <ScenariosTable rows={rows} />}

      {procedural && <ProceduralScenarioModal userId={teacherId} onClose={() => setProcedural(false)} />}
    </Stack>
  );
}

const TeacherScenariosPage = () => {
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  return <Scenarios teacherId={teacherId} />;
};

export default TeacherScenariosPage;
