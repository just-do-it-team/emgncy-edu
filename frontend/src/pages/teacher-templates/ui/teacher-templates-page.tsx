import { Alert, Anchor, Group, Paper, Select, Skeleton, Stack, Table, Text, TextInput } from "@mantine/core";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import { classifierRecords } from "@/entities/incident";
import {
  activeUsages,
  groupTemplates,
  templateUsages,
  templateVariantLabels,
  useScenarios,
  useTemplates,
  type TemplateEntry,
} from "@/entities/scenario";
import { useSessionStore } from "@/entities/session";
import type { ScenarioListItem, TemplateVariant } from "@/shared/api";
import { formatShortDateTime, sortRows, useTableQuery } from "@/shared/lib";
import { Button, FilteredEmpty, LinkRow, SortableTh, TablePagination, usePagination } from "@/shared/ui";
import { serviceName, useServiceNames } from "@/widgets/expected-result-view";
import { ScenarioLibraryTabs } from "@/widgets/scenario-library-tabs";
import { CreateTemplateMenu } from "./create-template-menu";
import classes from "./teacher-templates.module.scss";

const SORT_KEYS = ["name", "variant", "type", "version", "active", "author", "used", "updated"] as const;
const FILTER_KEYS = ["q", "variant", "type", "service", "activity", "author"] as const;

const INACTIVE = "inactive";
const ALL = "all";
const OWN = "own";

const variantOrder: Record<TemplateVariant, number> = { call: 0, card112: 1, cardDds: 2 };

const variantOptions = Object.entries(templateVariantLabels).map(([value, label]) => ({ value, label }));

const activityOptions = [
  { value: INACTIVE, label: "Неактивные" },
  { value: ALL, label: "Все, включая неактивные" },
];

const authorOptions = [{ value: OWN, label: "Мои" }];

const recordNames = new Map(classifierRecords.map((record) => [record.id, record.name]));

interface TemplateRow {
  entry: TemplateEntry;
  typeName: string | null;
  own: boolean;
  used: number | null;
}

function matchesActivity(active: boolean, filter: string | null): boolean {
  if (filter === ALL) return true;
  if (filter === INACTIVE) return !active;

  return active;
}

function TemplatesTable({ rows, serviceNames }: { rows: TemplateRow[]; serviceNames: Map<string, string> }) {
  const table = useTableQuery("templates", SORT_KEYS, FILTER_KEYS);
  const query = table.filter("q")?.trim().toLocaleLowerCase("ru") ?? "";
  const variant = table.filter("variant");
  const type = table.filter("type");
  const service = table.filter("service");
  const activity = table.filter("activity");
  const author = table.filter("author");

  const typeOptions = [
    ...new Map(
      rows.flatMap((row) =>
        row.entry.latest.recordId !== null && row.typeName !== null
          ? [[String(row.entry.latest.recordId), row.typeName] as const]
          : [],
      ),
    ),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((first, second) => first.label.localeCompare(second.label, "ru"));
  const serviceOptions = [...new Set(rows.flatMap((row) => row.entry.latest.services))]
    .map((code) => ({ value: code, label: serviceName(code, serviceNames) }))
    .sort((first, second) => first.label.localeCompare(second.label, "ru"));

  const visible = sortRows(
    rows.filter(
      ({ entry, own }) =>
        (query === "" || entry.latest.name.toLocaleLowerCase("ru").includes(query)) &&
        (variant === null || entry.latest.variant === variant) &&
        (type === null || String(entry.latest.recordId) === type) &&
        (service === null || entry.latest.services.includes(service)) &&
        matchesActivity(entry.latest.isActive, activity) &&
        (author === null || own),
    ),
    table.sort,
    {
      name: (row) => row.entry.latest.name,
      variant: (row) => variantOrder[row.entry.latest.variant],
      type: (row) => row.typeName,
      version: (row) => row.entry.latest.version,
      active: (row) => (row.entry.latest.isActive ? 0 : 1),
      author: (row) => (row.own ? 0 : 1),
      used: (row) => row.used,
      updated: (row) => Date.parse(row.entry.latest.createdAt),
    },
    (first, second) => Date.parse(second.entry.latest.createdAt) - Date.parse(first.entry.latest.createdAt),
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
          w={150}
          placeholder="Вид: все"
          aria-label="Фильтр по виду"
          data={variantOptions}
          value={variant}
          onChange={(value) => table.setFilter("variant", value)}
          clearable
        />
        <Select
          size="xs"
          w={220}
          placeholder="Тип происшествия: любой"
          aria-label="Фильтр по типу происшествия"
          data={typeOptions}
          value={type}
          onChange={(value) => table.setFilter("type", value)}
          searchable
          clearable
        />
        <Select
          size="xs"
          w={180}
          placeholder="Служба: любая"
          aria-label="Фильтр по службе"
          data={serviceOptions}
          value={service}
          onChange={(value) => table.setFilter("service", value)}
          searchable
          clearable
        />
        <Select
          size="xs"
          w={200}
          placeholder="Активные"
          aria-label="Фильтр по активности"
          data={activityOptions}
          value={activity}
          onChange={(value) => table.setFilter("activity", value)}
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
      </Group>

      {visible.length === 0 ? (
        <FilteredEmpty onReset={table.resetFilters} />
      ) : (
        <Paper withBorder>
          <Table verticalSpacing="sm" highlightOnHover layout="fixed">
            <colgroup>
              <col />
              <col width={130} />
              <col width={200} />
              <col width={90} />
              <col width={100} />
              <col width={120} />
              <col width={120} />
              <col width={120} />
            </colgroup>
            <Table.Thead>
              <Table.Tr>
                <SortableTh label="Название" direction={table.directionOf("name")} onSort={() => table.cycleSort("name")} />
                <SortableTh label="Вид" direction={table.directionOf("variant")} onSort={() => table.cycleSort("variant")} />
                <SortableTh
                  label="Тип происшествия"
                  direction={table.directionOf("type")}
                  onSort={() => table.cycleSort("type")}
                />
                <SortableTh
                  label="Версия"
                  direction={table.directionOf("version")}
                  onSort={() => table.cycleSort("version")}
                />
                <SortableTh
                  label="Активен"
                  direction={table.directionOf("active")}
                  onSort={() => table.cycleSort("active")}
                />
                <SortableTh
                  label="Автор"
                  direction={table.directionOf("author")}
                  onSort={() => table.cycleSort("author")}
                />
                <SortableTh
                  label="В сценариях"
                  hint="Неархивные сценарии, которые ссылаются на любую версию шаблона"
                  direction={table.directionOf("used")}
                  onSort={() => table.cycleSort("used")}
                />
                <SortableTh
                  label="Обновлён"
                  hint="Когда создана последняя версия"
                  direction={table.directionOf("updated")}
                  onSort={() => table.cycleSort("updated")}
                />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagination.rows.map(({ entry, typeName, own, used }) => (
                <LinkRow key={`${entry.latest.kind}:${entry.templateKey}`}>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/teacher/scenarios/templates/${entry.latest.kind}/${entry.latest.id}`}
                      size="sm"
                      c="povDark2.6"
                      underline="never"
                      data-row-link
                      className={classes.truncatedLink}
                    >
                      {entry.latest.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{templateVariantLabels[entry.latest.variant]}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={2} c={typeName ? undefined : "povDark2.6"}>
                      {typeName ?? "не найден в классификаторе"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className={classes.numeric}>
                      {entry.latest.version}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={entry.latest.isActive ? undefined : "povDark2.6"}>
                      {entry.latest.isActive ? "да" : "нет"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={own ? undefined : "povDark2.6"}>
                      {own ? "Вы" : "Другой преподаватель"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className={classes.numeric}>
                      {used ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className={classes.numeric}>
                      {formatShortDateTime(entry.latest.createdAt)}
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

function templateRows(
  entries: TemplateEntry[],
  scenarios: ScenarioListItem[] | undefined,
  teacherId: string,
): TemplateRow[] {
  return entries.map((entry) => ({
    entry,
    typeName: entry.latest.recordId === null ? null : (recordNames.get(entry.latest.recordId) ?? null),
    own: entry.latest.createdBy === teacherId,
    used: scenarios ? activeUsages(templateUsages(entry, scenarios)).length : null,
  }));
}

function Templates({ teacherId }: { teacherId: string }) {
  const templates = useTemplates();
  const scenarios = useScenarios();
  const serviceNames = useServiceNames();
  const rows = templateRows(groupTemplates(templates.data ?? []), scenarios.data, teacherId);

  return (
    <Stack gap="md">
      <ScenarioLibraryTabs active="templates" actions={<CreateTemplateMenu />} />

      {templates.isPending && (
        <Paper withBorder p="md">
          <Stack gap="xs">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} height={28} radius={2} />
            ))}
          </Stack>
        </Paper>
      )}

      {templates.isError && (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить шаблоны">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => templates.refetch()}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {scenarios.isError && templates.isSuccess && (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить сценарии">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Колонка «В сценариях» недоступна.</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => scenarios.refetch()}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {templates.isSuccess && rows.length === 0 && (
        <Paper withBorder p="md">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Шаблонов пока нет
            </Text>
            <Text size="sm" c="povDark2.6">
              Шаблон — готовый звонок или карточка с эталоном, из которых собирается сценарий. Создайте первый
              шаблон кнопкой «Создать шаблон».
            </Text>
          </Stack>
        </Paper>
      )}

      {templates.isSuccess && rows.length > 0 && <TemplatesTable rows={rows} serviceNames={serviceNames} />}
    </Stack>
  );
}

const TeacherTemplatesPage = () => {
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  return <Templates teacherId={teacherId} />;
};

export default TeacherTemplatesPage;
