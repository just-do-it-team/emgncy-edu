import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Group,
  Modal,
  Pagination,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { Button } from "@/shared/ui";
import { handleApiError } from "@/shared/api";
import {
  adminGet,
  downloadAudit,
  type AuditEvent,
  type ErrorReport,
  type HealthReport,
  type LoadReport,
  type Page,
  type QueryParams,
  type ReportDefinition,
  type UsageReport,
} from "./api";
import { Empty, QueryState, Section, Stat, Status } from "./common";
import { dateTime, metric } from "./format";

const reportKeys = [
  "usage",
  "errors",
  "server-load",
  "health",
  "user-actions",
] as const;
type ReportKey = (typeof reportKeys)[number];
const names: Record<ReportKey, string> = {
  usage: "Использование",
  errors: "Ошибки",
  "server-load": "Нагрузка",
  health: "Работоспособность",
  "user-actions": "Действия пользователей",
};
const loadNames: Record<string, string> = {
  cpu_percent: "CPU",
  memory_percent: "Оперативная память",
  disk_percent: "Диск",
  network_bytes_per_second: "Сетевой трафик",
};

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function Period({
  start,
  end,
  setStart,
  setEnd,
}: {
  start: string;
  end: string;
  setStart: (value: string) => void;
  setEnd: (value: string) => void;
}) {
  return (
    <Group>
      <TextInput
        type="datetime-local"
        label="С"
        value={start}
        onChange={(event) => setStart(event.currentTarget.value)}
      />
      <TextInput
        type="datetime-local"
        label="По"
        value={end}
        onChange={(event) => setEnd(event.currentTarget.value)}
      />
      <Text size="xs" c="dimmed">
        Пустые поля используют период по умолчанию
      </Text>
    </Group>
  );
}

export function AdminReportsPage() {
  const [tab, setTab] = useState<ReportKey>("usage");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const actorValid =
    !actor.trim() ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      actor.trim(),
    );
  const catalog = useQuery({
    queryKey: ["admin", "reports", "catalog"],
    queryFn: () => adminGet<ReportDefinition[]>("/reports/catalog"),
  });
  const period: QueryParams = {
    start: toIso(start),
    end: toIso(end),
  };
  const auditFilters: QueryParams = {
    ...period,
    actor_id: actor.trim() || undefined,
    action: action.trim() || undefined,
    result: result || undefined,
  };
  const usage = useQuery({
    queryKey: ["admin", "reports", "usage", period],
    enabled: tab === "usage",
    queryFn: () => adminGet<UsageReport>("/reports/usage", period),
  });
  const errors = useQuery({
    queryKey: ["admin", "reports", "errors", period],
    enabled: tab === "errors",
    queryFn: () => adminGet<ErrorReport>("/reports/errors", period),
  });
  const load = useQuery({
    queryKey: ["admin", "reports", "server-load", period],
    enabled: tab === "server-load",
    queryFn: () => adminGet<LoadReport>("/reports/server-load", period),
  });
  const health = useQuery({
    queryKey: ["admin", "reports", "health"],
    enabled: tab === "health",
    queryFn: () => adminGet<HealthReport>("/reports/health"),
  });
  const audit = useQuery({
    queryKey: ["admin", "reports", "user-actions", auditFilters, page],
    enabled: tab === "user-actions" && actorValid,
    queryFn: () =>
      adminGet<Page<AuditEvent>>("/reports/user-actions", {
        ...auditFilters,
        limit: 50,
        offset: (page - 1) * 50,
      }),
  });
  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadAudit(auditFilters);
    } catch (error) {
      handleApiError(error, "Не удалось скачать CSV");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Section title="Отчёты">
      <QueryState
        pending={catalog.isPending}
        error={catalog.isError}
        onRetry={() => catalog.refetch()}
      />
      {catalog.data && (
        <Tabs
          value={tab}
          onChange={(value) => setTab((value ?? "usage") as ReportKey)}
        >
          <Tabs.List>
            {reportKeys
              .filter((key) => catalog.data.some((item) => item.key === key))
              .map((key) => (
                <Tabs.Tab key={key} value={key}>
                  {names[key]}
                </Tabs.Tab>
              ))}
          </Tabs.List>
        </Tabs>
      )}
      {catalog.data && (
        <Text size="sm" c="dimmed">
          {catalog.data.find((item) => item.key === tab)?.description}
        </Text>
      )}
      {tab !== "health" && (
        <Period
          start={start}
          end={end}
          setStart={(value) => {
            setStart(value);
            setPage(1);
          }}
          setEnd={(value) => {
            setEnd(value);
            setPage(1);
          }}
        />
      )}
      {start && end && new Date(start) >= new Date(end) && (
        <Text c="red" size="sm">
          Начало периода должно быть раньше окончания.
        </Text>
      )}

      {tab === "usage" && (
        <>
          <QueryState
            pending={usage.isPending}
            error={usage.isError}
            onRetry={() => usage.refetch()}
          />
          {usage.data && (
            <Stack>
              <Group align="stretch">
                <Stat
                  label="Создано карточек"
                  value={usage.data.cards_created}
                />
                <Stat label="Пользователей" value={usage.data.users_total} />
                <Stat label="Заблокировано" value={usage.data.users_blocked} />
              </Group>
              <Paper withBorder p="md">
                <Text fw={600} mb="xs">
                  Карточки по статусам
                </Text>
                {Object.entries(usage.data.cards_by_status).length ? (
                  Object.entries(usage.data.cards_by_status).map(
                    ([status, count]) => (
                      <Text key={status} size="sm">
                        {status}: {count}
                      </Text>
                    ),
                  )
                ) : (
                  <Text size="sm" c="dimmed">
                    Карточек за период нет
                  </Text>
                )}
              </Paper>
            </Stack>
          )}
        </>
      )}
      {tab === "errors" && (
        <>
          <QueryState
            pending={errors.isPending}
            error={errors.isError}
            onRetry={() => errors.refetch()}
          />
          {errors.data && (
            <Stack>
              <Stat label="Ошибок за период" value={errors.data.total} />
              <Paper withBorder p="md">
                {Object.entries(errors.data.by_service).length ? (
                  Object.entries(errors.data.by_service).map(
                    ([service, count]) => (
                      <Text key={service} size="sm">
                        {service}: {count}
                      </Text>
                    ),
                  )
                ) : (
                  <Text size="sm" c="dimmed">
                    Ошибок не найдено
                  </Text>
                )}
              </Paper>
            </Stack>
          )}
        </>
      )}
      {tab === "server-load" && (
        <>
          <QueryState
            pending={load.isPending}
            error={load.isError}
            onRetry={() => load.refetch()}
          />
          {load.data && (
            <Stack>
              {load.data.warnings.map((warning, index) => (
                <Text key={index} size="sm" c="orange">
                  {warning}
                </Text>
              ))}
              <Paper withBorder>
                <ScrollArea>
                  <Table striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Показатель</Table.Th>
                        <Table.Th>Сейчас</Table.Th>
                        <Table.Th>Среднее</Table.Th>
                        <Table.Th>Максимум</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {load.data.metrics.map((item) => (
                        <Table.Tr key={item.key}>
                          <Table.Td>{loadNames[item.key] ?? item.key}</Table.Td>
                          <Table.Td>
                            {metric(item.current, ` ${item.unit}`)}
                          </Table.Td>
                          <Table.Td>
                            {metric(item.average, ` ${item.unit}`)}
                          </Table.Td>
                          <Table.Td>
                            {metric(item.maximum, ` ${item.unit}`)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Paper>
            </Stack>
          )}
        </>
      )}
      {tab === "health" && (
        <>
          <QueryState
            pending={health.isPending}
            error={health.isError}
            onRetry={() => health.refetch()}
          />
          {health.data && (
            <Stack>
              <Group>
                <Status value={health.data.status} />
                <Stat
                  label="Активные оповещения"
                  value={health.data.firing_alerts}
                />
                <Text size="sm" c="dimmed">
                  {dateTime(health.data.generated_at)}
                </Text>
              </Group>
              {health.data.targets.length ? (
                <Paper withBorder>
                  <ScrollArea>
                    <Table striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Источник</Table.Th>
                          <Table.Th>Адрес</Table.Th>
                          <Table.Th>Состояние</Table.Th>
                          <Table.Th>Ошибка</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {health.data.targets.map((item) => (
                          <Table.Tr key={`${item.job}-${item.instance}`}>
                            <Table.Td>
                              {item.job}
                              {item.optional ? " (необязательный)" : ""}
                            </Table.Td>
                            <Table.Td>{item.instance}</Table.Td>
                            <Table.Td>
                              <Status value={item.health} />
                            </Table.Td>
                            <Table.Td>{item.error || "—"}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Paper>
              ) : (
                <Empty text="Источники не найдены" />
              )}
            </Stack>
          )}
        </>
      )}
      {tab === "user-actions" && (
        <Stack>
          <Group align="end">
            <TextInput
              label="ID пользователя"
              placeholder="UUID"
              error={!actorValid ? "Укажите корректный UUID" : undefined}
              value={actor}
              onChange={(event) => {
                setActor(event.currentTarget.value);
                setPage(1);
              }}
            />
            <TextInput
              label="Действие"
              maxLength={100}
              value={action}
              onChange={(event) => {
                setAction(event.currentTarget.value);
                setPage(1);
              }}
            />
            <Select
              label="Результат"
              placeholder="Все"
              clearable
              data={["SUCCESS", "FAILURE", "DENIED"]}
              value={result}
              onChange={(value) => {
                setResult(value);
                setPage(1);
              }}
            />
            <Button
              variant="outline"
              disabled={!actorValid}
              loading={exporting}
              onClick={() => void exportCsv()}
            >
              Скачать CSV
            </Button>
          </Group>
          {actorValid && (
            <QueryState
              pending={audit.isPending}
              error={audit.isError}
              onRetry={() => audit.refetch()}
            />
          )}
          {audit.data &&
            (audit.data.items.length ? (
              <>
                <Paper withBorder>
                  <ScrollArea>
                    <Table striped highlightOnHover>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Время</Table.Th>
                          <Table.Th>Пользователь</Table.Th>
                          <Table.Th>Действие</Table.Th>
                          <Table.Th>Объект</Table.Th>
                          <Table.Th>Результат</Table.Th>
                          <Table.Th></Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {audit.data.items.map((item) => (
                          <Table.Tr key={item.id}>
                            <Table.Td>{dateTime(item.occurred_at)}</Table.Td>
                            <Table.Td>
                              {item.actor_username ??
                                item.actor_id ??
                                "Система"}
                            </Table.Td>
                            <Table.Td>{item.action}</Table.Td>
                            <Table.Td>
                              {item.target_type} {item.target_id ?? ""}
                            </Table.Td>
                            <Table.Td>
                              <Status value={item.result} />
                            </Table.Td>
                            <Table.Td>
                              <Button
                                size="xs"
                                variant="subtle"
                                onClick={() => setSelected(item)}
                              >
                                Подробнее
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Paper>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Всего: {audit.data.total}
                  </Text>
                  <Pagination
                    total={Math.max(1, Math.ceil(audit.data.total / 50))}
                    value={page}
                    onChange={setPage}
                  />
                </Group>
              </>
            ) : (
              <Empty text="Действий за период нет" />
            ))}
        </Stack>
      )}
      <Modal
        opened={!!selected}
        onClose={() => setSelected(null)}
        title="Действие пользователя"
        centered
        size="lg"
      >
        {selected && (
          <Stack gap="xs">
            <Text size="sm">Время: {dateTime(selected.occurred_at)}</Text>
            <Text size="sm">
              Пользователь:{" "}
              {selected.actor_username ?? selected.actor_id ?? "Система"}
            </Text>
            <Text size="sm">Действие: {selected.action}</Text>
            <Text size="sm">Результат: {selected.result}</Text>
            <Text size="sm">
              Объект: {selected.target_type} {selected.target_id ?? ""}
            </Text>
            <Text size="sm">IP: {selected.ip_address ?? "—"}</Text>
            <Text size="sm">ID запроса: {selected.request_id ?? "—"}</Text>
            <Text size="sm" fw={600}>
              Детали
            </Text>
            <Paper withBorder p="sm">
              <Text
                component="pre"
                size="xs"
                style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
              >
                {JSON.stringify(selected.details, null, 2)}
              </Text>
            </Paper>
          </Stack>
        )}
      </Modal>
    </Section>
  );
}
