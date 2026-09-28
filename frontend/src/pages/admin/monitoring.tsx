import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Anchor,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  adminGet,
  type CurrentMetric,
  type Dashboard,
  type MetricDefinition,
  type MetricSeries,
  type MonitoringAlert,
  type MonitoringTarget,
} from "./api";
import { Empty, QueryState, Section, Status } from "./common";
import { dateTime, metric } from "./format";

const categoryNames: Record<MetricDefinition["category"], string> = {
  host: "Сервер",
  containers: "Контейнеры",
  gpu: "GPU",
  postgres: "PostgreSQL",
  kafka: "Kafka",
  services: "Сервисы",
};
const ranges = [
  { value: "1", label: "Последний час" },
  { value: "24", label: "Последние сутки" },
  { value: "168", label: "Последняя неделя" },
  { value: "720", label: "Последние 30 дней" },
];

function seriesLabel(labels: Record<string, string>, index: number): string {
  return (
    ["device", "name", "uuid", "datname", "topic", "instance", "job"]
      .map((key) => labels[key])
      .filter(Boolean)
      .join(" · ") || `Ряд ${index + 1}`
  );
}

function MetricChart({ data }: { data: MetricSeries }) {
  const points = new Map<string, Record<string, number | string>>();
  data.series.forEach((series, index) =>
    series.points.forEach((point) => {
      const row = points.get(point.timestamp) ?? { timestamp: point.timestamp };
      row[`series-${index}`] = point.value;
      points.set(point.timestamp, row);
    }),
  );
  if (!points.size) return <Empty text="За выбранный период данных нет" />;
  return (
    <Paper withBorder p="md" h={320}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={[...points.values()].sort((a, b) =>
            String(a.timestamp).localeCompare(String(b.timestamp)),
          )}
          margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value: string) =>
              new Date(value).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            }
            minTickGap={32}
          />
          <YAxis width={60} />
          <Tooltip
            labelFormatter={(value) => dateTime(String(value))}
            formatter={(value) => metric(Number(value), ` ${data.unit}`)}
          />
          <Legend />
          {data.series.map((item, index) => (
            <Line
              key={index}
              type="monotone"
              dataKey={`series-${index}`}
              name={seriesLabel(item.labels, index)}
              dot={false}
              connectNulls={false}
              stroke={
                ["#157dbd", "#ec653b", "#6c364b", "#2f353a", "#3c9149"][
                  index % 5
                ]
              }
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
}

export function AdminMonitoringPage() {
  const [key, setKey] = useState<string | null>(null);
  const [hours, setHours] = useState("1");
  const catalog = useQuery({
    queryKey: ["admin", "metric-catalog"],
    queryFn: () => adminGet<MetricDefinition[]>("/monitoring/metrics"),
  });
  const selected = key ?? catalog.data?.[0]?.key ?? null;
  const current = useQuery({
    queryKey: ["admin", "metrics-current"],
    queryFn: () => adminGet<CurrentMetric[]>("/monitoring/metrics/current"),
    refetchInterval: 15000,
  });
  const end = Math.floor(Date.now() / 60000) * 60000;
  const series = useQuery({
    queryKey: [
      "admin",
      "metric-series",
      selected,
      hours,
      Math.floor(end / 300000),
    ],
    enabled: !!selected,
    queryFn: () =>
      adminGet<MetricSeries>(
        `/monitoring/metrics/${encodeURIComponent(selected!)}/series`,
        {
          start: new Date(end - Number(hours) * 3600000).toISOString(),
          end: new Date(end).toISOString(),
        },
      ),
  });
  const targets = useQuery({
    queryKey: ["admin", "targets"],
    queryFn: () => adminGet<MonitoringTarget[]>("/monitoring/targets"),
    refetchInterval: 30000,
  });
  const alerts = useQuery({
    queryKey: ["admin", "alerts"],
    queryFn: () => adminGet<MonitoringAlert[]>("/monitoring/alerts"),
    refetchInterval: 15000,
  });
  const dashboards = useQuery({
    queryKey: ["admin", "dashboards"],
    queryFn: () => adminGet<Dashboard[]>("/monitoring/dashboards"),
  });
  const selectedDefinition = catalog.data?.find(
    (item) => item.key === selected,
  );

  return (
    <Stack gap="xl">
      <Section title="Метрики">
        <QueryState
          pending={catalog.isPending}
          error={catalog.isError}
          onRetry={() => catalog.refetch()}
        />
        {catalog.data && (
          <>
            <Group align="end">
              <Select
                label="Показатель"
                w={340}
                searchable
                data={catalog.data.map((item) => ({
                  value: item.key,
                  label: `${categoryNames[item.category]} · ${item.title}`,
                }))}
                value={selected}
                onChange={setKey}
              />
              <Select
                label="Период"
                w={200}
                data={ranges}
                value={hours}
                onChange={(value) => setHours(value ?? "1")}
              />
            </Group>
            <Text size="sm" c="dimmed">
              {selectedDefinition?.description}
            </Text>
            <QueryState
              pending={series.isPending}
              error={series.isError}
              onRetry={() => series.refetch()}
            />
            {series.data && <MetricChart data={series.data} />}
          </>
        )}
        <QueryState
          pending={current.isPending}
          error={current.isError}
          onRetry={() => current.refetch()}
        />
        {catalog.data && current.data && (
          <Paper withBorder>
            <ScrollArea>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Показатель</Table.Th>
                    <Table.Th>Текущее значение</Table.Th>
                    <Table.Th>Время измерения</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {catalog.data.map((definition) => {
                    const samples =
                      current.data.find((item) => item.key === definition.key)
                        ?.samples ?? [];
                    return (
                      <Table.Tr key={definition.key}>
                        <Table.Td>
                          {definition.title}
                          {definition.optional && (
                            <Text size="xs" c="dimmed">
                              Необязательный показатель
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {samples.length
                            ? samples.map((sample, index) => (
                                <Text size="sm" key={index}>
                                  {seriesLabel(sample.labels, index)}:{" "}
                                  {metric(sample.value, ` ${definition.unit}`)}
                                </Text>
                              ))
                            : "Нет данных"}
                        </Table.Td>
                        <Table.Td>
                          {samples.length
                            ? dateTime(samples[0].timestamp)
                            : "—"}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        )}
      </Section>
      <Section title="Источники данных">
        <QueryState
          pending={targets.isPending}
          error={targets.isError}
          onRetry={() => targets.refetch()}
        />
        {targets.data &&
          (targets.data.length ? (
            <Paper withBorder>
              <ScrollArea>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Источник</Table.Th>
                      <Table.Th>Адрес</Table.Th>
                      <Table.Th>Состояние</Table.Th>
                      <Table.Th>Последний опрос</Table.Th>
                      <Table.Th>Ошибка</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {targets.data.map((item) => (
                      <Table.Tr key={`${item.job}-${item.instance}`}>
                        <Table.Td>
                          {item.job}
                          {item.optional && (
                            <Text size="xs" c="dimmed">
                              Необязательный
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>{item.instance}</Table.Td>
                        <Table.Td>
                          <Status value={item.health} />
                        </Table.Td>
                        <Table.Td>{dateTime(item.last_scrape_at)}</Table.Td>
                        <Table.Td>{item.error || "—"}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
          ) : (
            <Empty text="Источники не найдены" />
          ))}
      </Section>
      <Section title="Оповещения">
        <QueryState
          pending={alerts.isPending}
          error={alerts.isError}
          onRetry={() => alerts.refetch()}
        />
        {alerts.data &&
          (alerts.data.length ? (
            <Stack gap="xs">
              {alerts.data.map((item, index) => (
                <Paper withBorder p="md" key={`${item.name}-${index}`}>
                  <Group justify="space-between">
                    <Text fw={600}>{item.name}</Text>
                    <Status
                      value={item.state}
                      label={`${item.state} · ${item.severity}`}
                    />
                  </Group>
                  <Text size="sm">
                    {item.summary || item.description || "Без описания"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    С {dateTime(item.active_at)}
                  </Text>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Empty text="Активных оповещений нет" />
          ))}
      </Section>
      <Section title="Панели Grafana">
        <QueryState
          pending={dashboards.isPending}
          error={dashboards.isError}
          onRetry={() => dashboards.refetch()}
        />
        {dashboards.data && (
          <Paper withBorder p="md">
            <Stack gap="xs">
              {dashboards.data.map((item) => (
                <Anchor
                  key={item.key}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.title} ↗
                </Anchor>
              ))}
            </Stack>
          </Paper>
        )}
      </Section>
    </Stack>
  );
}
