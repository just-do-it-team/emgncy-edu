import { Alert, Group, Paper, Select, Skeleton, Stack, Text, Title } from "@mantine/core";
import { useSessionStore } from "@/entities/session";
import { Button } from "@/shared/ui";
import { NO_GROUP, periodOptions, useAnalyticsData, useAnalyticsFilters } from "../api/use-analytics-data";
import { studentStats } from "../model/student-stats";
import { ErrorHeatmap } from "./error-heatmap";
import { ForecastBlock } from "./forecast-block";
import { Leaders } from "./leaders";
import { NormBars } from "./norm-bars";
import { PerformanceTable } from "./performance-table";

function Analytics({ teacherId }: { teacherId: string }) {
  const filters = useAnalyticsFilters();
  const data = useAnalyticsData(teacherId, filters.group, filters.period);
  const stats = studentStats(data.facts);
  const groupOptions = [
    ...data.groups.map((group) => ({ value: group.id, label: group.name })),
    { value: NO_GROUP, label: "Без группы" },
  ];

  return (
    <Stack gap="md">
      <Title order={2} size="h4" fw={600}>
        Аналитика
      </Title>

      <Group gap="sm" wrap="wrap" align="flex-end">
        <Select
          size="xs"
          w={240}
          label="Группа"
          placeholder="Все группы"
          data={groupOptions}
          value={filters.group}
          onChange={filters.setGroup}
          clearable
        />
        <Select
          size="xs"
          w={160}
          label="Период"
          data={periodOptions}
          value={filters.period}
          allowDeselect={false}
          onChange={(value) => {
            if (value !== null) filters.setPeriod(value);
          }}
        />
        {data.contextsTotal > 0 && (data.contextsPending > 0 || data.contextsFailed > 0) && (
          <Group gap="xs" aria-live="polite">
            <Text size="xs" c="povDark2.6">
              Разборы попыток: загружено {data.contextsTotal - data.contextsPending - data.contextsFailed} из{" "}
              {data.contextsTotal}
              {data.contextsFailed > 0 ? `, не загрузилось ${data.contextsFailed}` : ""}
            </Text>
            {data.contextsFailed > 0 && (
              <Button size="compact-xs" variant="outline" color="povDark2.6" onClick={data.retryContexts}>
                Повторить
              </Button>
            )}
          </Group>
        )}
      </Group>

      {data.pending ? (
        <Stack gap="md">
          <Skeleton height={220} radius={2} />
          <Skeleton height={320} radius={2} />
        </Stack>
      ) : data.error ? (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить попытки">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={data.retry}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      ) : stats.length === 0 ? (
        <Paper withBorder p="md">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              За выбранный период завершённых попыток нет
            </Text>
            <Text size="sm" c="povDark2.6">
              Аналитика появится после первой завершённой попытки. Для тренда нужно больше трёх попыток обучаемого, для
              прогноза — хотя бы одно занятие, для проверки прогноза — два. Расширьте период или снимите фильтр группы.
            </Text>
          </Stack>
        </Paper>
      ) : (
        <>
          <ErrorHeatmap stats={stats} facts={data.facts} />
          <PerformanceTable stats={stats} />
          <NormBars stats={stats} />
          <Leaders stats={stats} />
          <ForecastBlock stats={stats} />
        </>
      )}
    </Stack>
  );
}

const TeacherAnalyticsPage = () => {
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  return <Analytics teacherId={teacherId} />;
};

export default TeacherAnalyticsPage;
