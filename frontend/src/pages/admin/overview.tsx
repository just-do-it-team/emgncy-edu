import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import {
  adminGet,
  type Component,
  type Overview,
  type SystemEvent,
} from "./api";
import { Empty, QueryState, Section, Stat, Status } from "./common";
import { dateTime, metric } from "./format";

const stateLabels: Record<string, string> = {
  healthy: "Работает",
  degraded: "Есть проблемы",
  unavailable: "Недоступно",
  unhealthy: "Недоступно",
  unknown: "Неизвестно",
};

export function AdminOverviewPage() {
  const overview = useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => adminGet<Overview>("/overview"),
    refetchInterval: 15000,
  });
  const components = useQuery({
    queryKey: ["admin", "components"],
    queryFn: () => adminGet<Component[]>("/overview/components"),
    refetchInterval: 30000,
  });
  const events = useQuery({
    queryKey: ["admin", "events"],
    queryFn: () =>
      adminGet<SystemEvent[]>("/overview/events", { hours: 24, limit: 20 }),
    refetchInterval: 30000,
  });

  return (
    <Stack gap="xl">
      <Section title="Состояние системы">
        <QueryState
          pending={overview.isPending}
          error={overview.isError}
          onRetry={() => overview.refetch()}
        />
        {overview.data && (
          <>
            <Group gap="sm">
              <Status
                value={overview.data.status}
                label={stateLabels[overview.data.status]}
              />
              <Text size="sm" c="dimmed">
                Обновлено {dateTime(overview.data.generated_at)}
              </Text>
            </Group>
            {overview.data.warnings.length > 0 && (
              <Alert color="yellow" title="Часть данных недоступна">
                {overview.data.warnings.join("; ")}
              </Alert>
            )}
            <Group align="stretch" gap="sm">
              <Stat
                label="Обязательные компоненты"
                value={`${overview.data.components.healthy} из ${overview.data.components.total}`}
              />
              <Stat
                label="Активные оповещения"
                value={overview.data.firing_alerts}
              />
              <Stat
                label="Ошибки за сутки"
                value={overview.data.errors_24h ?? "Нет данных"}
              />
              <Stat
                label="CPU"
                value={metric(overview.data.host.cpu_percent, "%")}
              />
              <Stat
                label="Оперативная память"
                value={metric(overview.data.host.memory_percent, "%")}
              />
              <Stat
                label="Диск"
                value={metric(overview.data.host.disk_percent, "%")}
              />
              <Stat
                label="PostgreSQL"
                value={
                  overview.data.postgres_up === null
                    ? "Нет данных"
                    : overview.data.postgres_up
                      ? "Доступен"
                      : "Недоступен"
                }
              />
              <Stat
                label="Брокеры Kafka"
                value={overview.data.kafka_brokers ?? "Нет данных"}
              />
              <Stat
                label="Задержка Kafka"
                value={metric(overview.data.kafka_consumer_lag)}
              />
              <Stat
                label="GPU"
                value={
                  overview.data.gpu.available
                    ? metric(overview.data.gpu.utilization_percent, "%")
                    : "Нет данных"
                }
              />
            </Group>
            <Paper withBorder p="md">
              <Text size="sm">
                Сеть: приём{" "}
                {metric(
                  overview.data.host.network_receive_bytes_per_second,
                  " Б/с",
                )}
                , передача{" "}
                {metric(
                  overview.data.host.network_transmit_bytes_per_second,
                  " Б/с",
                )}
                . Время работы:{" "}
                {overview.data.host.uptime_seconds === null
                  ? "Нет данных"
                  : metric(overview.data.host.uptime_seconds / 3600, " ч")}
                .{" "}
                {overview.data.gpu.available &&
                  `GPU: память ${metric(overview.data.gpu.memory_used_mib, " МиБ")} из ${metric(overview.data.gpu.memory_total_mib, " МиБ")}, температура ${metric(overview.data.gpu.temperature_celsius, " °C")}, мощность ${metric(overview.data.gpu.power_watts, " Вт")}.`}
              </Text>
            </Paper>
          </>
        )}
      </Section>
      <Section title="Компоненты">
        <QueryState
          pending={components.isPending}
          error={components.isError}
          onRetry={() => components.refetch()}
        />
        {components.data &&
          (components.data.length ? (
            <Paper withBorder>
              <ScrollArea>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Компонент</Table.Th>
                      <Table.Th>Адрес</Table.Th>
                      <Table.Th>Состояние</Table.Th>
                      <Table.Th>Последняя проверка</Table.Th>
                      <Table.Th>Ошибка</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {components.data.map((item) => (
                      <Table.Tr key={`${item.name}-${item.instance}`}>
                        <Table.Td>
                          {item.name}
                          {item.optional && (
                            <Text size="xs" c="dimmed">
                              Необязательный
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>{item.instance}</Table.Td>
                        <Table.Td>
                          <Status
                            value={item.status}
                            label={stateLabels[item.status]}
                          />
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
            <Empty text="Компоненты не найдены" />
          ))}
      </Section>
      <Section title="Последние события">
        <QueryState
          pending={events.isPending}
          error={events.isError}
          onRetry={() => events.refetch()}
        />
        {events.data &&
          (events.data.length ? (
            <Paper withBorder>
              <ScrollArea>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Время</Table.Th>
                      <Table.Th>Сервис</Table.Th>
                      <Table.Th>Уровень</Table.Th>
                      <Table.Th>Сообщение</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {events.data.map((item, index) => (
                      <Table.Tr key={`${item.timestamp}-${index}`}>
                        <Table.Td>{dateTime(item.timestamp)}</Table.Td>
                        <Table.Td>{item.service}</Table.Td>
                        <Table.Td>
                          <Status value={item.level} />
                        </Table.Td>
                        <Table.Td>{item.message}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
          ) : (
            <Empty text="Событий за последние сутки нет" />
          ))}
      </Section>
    </Stack>
  );
}
