import { Alert, Anchor, Group, Paper, Select, Skeleton, Stack, Table, Text, TextInput } from "@mantine/core";
import { Search } from "lucide-react";
import { Link } from "react-router-dom";
import { classifierRecords } from "@/entities/incident";
import {
  activeUsages,
  difficultyLabel,
  groupTemplates,
  templateAuthorLabel,
  templateSourceLabel,
  templateState,
  templateStateLabels,
  templateUsages,
  templateVariantHints,
  templateVariantLabels,
  templateVariantOrder,
  type TemplateState,
  useScenarios,
  usePendingGenerations,
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

const SORT_KEYS = ["name", "variant", "type", "difficulty", "version", "state", "author", "used", "updated"] as const;
const FILTER_KEYS = ["q", "variant", "type", "service", "state", "author"] as const;

const ALL = "all";
const OWN = "own";

const variantOrder: Record<TemplateVariant, number> = { call: 0, card112: 1, cardDds: 2 };

const variantOptions = templateVariantOrder.map((variant) => ({ value: variant, label: templateVariantLabels[variant] }));

const stateOptions = [
  { value: "published", label: "Опубликованные" },
  { value: "aiDraft", label: "Черновики ИИ" },
  { value: "archived", label: "В архиве" },
  { value: ALL, label: "Все, включая архив" },
];

const stateOrder: Record<TemplateState, number> = { aiDraft: 0, draft: 1, published: 2, archived: 3 };

const authorOptions = [{ value: OWN, label: "Мои" }];

const recordNames = new Map(classifierRecords.map((record) => [record.id, record.name]));

interface TemplateRow {
  entry: TemplateEntry;
  typeName: string | null;
  author: string;
  own: boolean;
  used: number | null;
}

function matchesState(state: TemplateState, filter: string | null): boolean {
  if (filter === ALL) return true;
  if (filter === null) return state !== "archived";

  return state === filter;
}

const DDS_VARIANT = "cardDds";

function TemplatesTable({ rows, serviceNames }: { rows: TemplateRow[]; serviceNames: Map<string, string> }) {
  const table = useTableQuery("templates", SORT_KEYS, FILTER_KEYS);
  const query = table.filter("q")?.trim().toLocaleLowerCase("ru") ?? "";
  const variant = table.filter("variant");
  const type = table.filter("type");
  const chosenVariants = templateVariantOrder.filter((shown) => shown === variant);
  const serviceFilterOn = variant === DDS_VARIANT;
  const service = serviceFilterOn ? table.filter("service") : null;
  const stateFilter = table.filter("state");
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
  const serviceOptions = [
    ...new Set(rows.filter((row) => row.entry.latest.variant === DDS_VARIANT).flatMap((row) => row.entry.latest.services)),
  ]
    .map((code) => ({ value: code, label: serviceName(code, serviceNames) }))
    .sort((first, second) => first.label.localeCompare(second.label, "ru"));

  const visible = sortRows(
    rows.filter(
      ({ entry, own }) =>
        (query === "" || entry.latest.name.toLocaleLowerCase("ru").includes(query)) &&
        (variant === null || entry.latest.variant === variant) &&
        (type === null || String(entry.latest.recordId) === type) &&
        (service === null || entry.latest.services.includes(service)) &&
        matchesState(templateState(entry.latest), stateFilter) &&
        (author === null || own),
    ),
    table.sort,
    {
      name: (row) => row.entry.latest.name,
      variant: (row) => variantOrder[row.entry.latest.variant],
      type: (row) => row.typeName,
      difficulty: (row) => row.entry.latest.difficulty,
      version: (row) => row.entry.latest.version,
      state: (row) => stateOrder[templateState(row.entry.latest)],
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
          onChange={(value) => {
            table.setFilter("variant", value);
            if (value !== DDS_VARIANT) table.setFilter("service", null);
          }}
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
          placeholder={serviceFilterOn ? "Служба: любая" : "Служба: для карточек ДДС"}
          aria-label="Фильтр по службе"
          title={serviceFilterOn ? undefined : "Фильтр по службе работает для вида «Карточка ДДС»"}
          data={serviceOptions}
          value={service}
          onChange={(value) => table.setFilter("service", value)}
          disabled={!serviceFilterOn}
          searchable
          clearable
        />
        <Select
          size="xs"
          w={200}
          placeholder="Статус: без архива"
          aria-label="Фильтр по статусу"
          data={stateOptions}
          value={stateFilter}
          onChange={(value) => table.setFilter("state", value)}
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

      <Stack gap={0}>
        {(chosenVariants.length > 0 ? chosenVariants : templateVariantOrder).map((shown) => (
          <Text key={shown} size="xs" c="povDark2.6">
            {templateVariantLabels[shown]} — {templateVariantHints[shown]}
          </Text>
        ))}
      </Stack>

      {visible.length === 0 ? (
        <FilteredEmpty onReset={table.resetFilters} />
      ) : (
        <Paper withBorder>
          <Table verticalSpacing="sm" highlightOnHover layout="fixed">
            <colgroup>
              <col />
              <col width={120} />
              <col width={180} />
              <col width={100} />
              <col width={80} />
              <col width={150} />
              <col width={110} />
              <col width={115} />
              <col width={110} />
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
                  label="Сложность"
                  direction={table.directionOf("difficulty")}
                  onSort={() => table.cycleSort("difficulty")}
                />
                <SortableTh
                  label="Версия"
                  direction={table.directionOf("version")}
                  onSort={() => table.cycleSort("version")}
                />
                <SortableTh
                  label="Статус"
                  direction={table.directionOf("state")}
                  onSort={() => table.cycleSort("state")}
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
              {pagination.rows.map(({ entry, typeName, author, own, used }) => (
                <LinkRow key={`${entry.latest.kind}:${entry.templateKey}`}>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/teacher/scenarios/templates/${entry.latest.kind}/${entry.latest.id}`}
                      size="sm"
                      c="povDark2.6"
                      underline="never"
                      data-row-link
                      lineClamp={2}
                      className={classes.nameLink}
                    >
                      {entry.latest.name}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{templateVariantLabels[entry.latest.variant]}</Text>
                    <Text size="xs" c="povDark2.6">
                      {templateSourceLabel(entry.latest)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={2} c={typeName ? undefined : "povDark2.6"}>
                      {typeName ?? "не найден в классификаторе"}
                    </Text>
                    {entry.latest.services.length > 0 && (
                      <Text size="xs" c="povDark2.6" lineClamp={1}>
                        {entry.latest.services.map((code) => serviceName(code, serviceNames)).join(", ")}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{difficultyLabel(entry.latest.difficulty)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className={classes.numeric}>
                      {entry.latest.version}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text
                      size="sm"
                      fw={templateState(entry.latest) === "aiDraft" ? 600 : undefined}
                      c={templateState(entry.latest) === "archived" ? "povDark2.6" : undefined}
                    >
                      {templateStateLabels[templateState(entry.latest)]}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={2} c={own ? undefined : "povDark2.6"}>
                      {author}
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
    author: templateAuthorLabel(entry.latest, teacherId),
    own: entry.latest.createdBy === teacherId,
    used: scenarios ? activeUsages(templateUsages(entry, scenarios)).length : null,
  }));
}

function Templates({ teacherId }: { teacherId: string }) {
  const templates = useTemplates();
  const pending = usePendingGenerations(teacherId);
  const scenarios = useScenarios();
  const serviceNames = useServiceNames();
  const rows = templateRows(groupTemplates(templates.data ?? []), scenarios.data, teacherId);

  return (
    <Stack gap="md">
      <ScenarioLibraryTabs
        active="templates"
        actions={
          <Group gap="xs">
            <Button size="sm" component={Link} to="/teacher/scenarios/templates/generate">
              Сгенерировать шаблоны с ИИ
            </Button>
            <CreateTemplateMenu />
          </Group>
        }
      />

      {pending.length > 0 && (
        <Alert variant="outline" color="povDark2.6" title={`Идёт генерация: ${pending.length}`}>
          <Group gap="xs" justify="space-between">
            <Text size="sm">Черновики появятся в списке со статусом «Черновик ИИ», обычно через 1–5 минут.</Text>
            <Anchor component={Link} to="/teacher/scenarios/templates/generate" size="sm" c="povDark2.6" underline="always">
              Открыть генерацию
            </Anchor>
          </Group>
        </Alert>
      )}

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
