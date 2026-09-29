import { useState } from "react";
import { Alert, Group, Paper, Select, Skeleton, Stack, Text, Title, useMantineTheme } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEmergencyServices } from "@/entities/emergency-service";
import { useSessionStore } from "@/entities/session";
import { serviceWithCode } from "@/shared/config";
import { downloadPdf, reportDocument, reportFileName, useSpelling, type ReportPalette } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { NO_GROUP, periodOptions, useAnalyticsData, useAnalyticsFilters } from "../api/use-analytics-data";
import { analyticsDocument, performanceContent } from "../model/analytics-report";
import { addressSummary, missedServices, periodKpis, spellingSummary, stageSummary } from "../model/group-insights";
import { studentStats, type StudentStats } from "../model/student-stats";
import { AddressErrors } from "./address-errors";
import { ErrorHeatmap } from "./error-heatmap";
import { ForecastBlock } from "./forecast-block";
import { GroupSides } from "./group-sides";
import { KpiTiles } from "./kpi-tiles";
import { MissedServices } from "./missed-services";
import { NormBars } from "./norm-bars";
import { PerformanceTable } from "./performance-table";
import { SpellingBlock } from "./spelling-block";
import { StatusTimes } from "./status-times";
import classes from "./analytics.module.scss";

type PdfKind = "analytics" | "performance";

function Analytics({ teacherId }: { teacherId: string }) {
  const filters = useAnalyticsFilters();
  const data = useAnalyticsData(teacherId, filters.group, filters.period);
  const stats = studentStats(data.facts);
  const theme = useMantineTheme();
  const services = useEmergencyServices();
  const [pdfPending, setPdfPending] = useState<PdfKind | null>(null);
  const spelling = useSpelling([...data.facts, ...(data.previousFacts ?? [])].flatMap((attempt) => attempt.typedWords));
  const misspelled = spelling.data ?? null;
  const groupOptions = [
    ...data.groups.map((group) => ({ value: group.id, label: group.name })),
    { value: NO_GROUP, label: "Без группы" },
  ];
  const serviceName = (code: string) =>
    serviceWithCode(code, [...(services.data?.values() ?? [])].find((service) => service.code === code)?.name ?? null);
  const kpis = periodKpis(data.facts, misspelled);
  const address = addressSummary(data.facts);
  const spellingStats = misspelled === null ? null : spellingSummary(data.facts, misspelled);
  const missed = missedServices(data.facts);
  const stages = stageSummary(data.facts);
  const scope = [
    `Группа: ${groupOptions.find((option) => option.value === filters.group)?.label ?? "все группы"}`,
    `период: ${periodOptions.find((option) => option.value === filters.period)?.label ?? filters.period}`,
  ].join("; ");

  const download = async (kind: PdfKind, rows: StudentStats[]) => {
    const palette: ReportPalette = {
      text: theme.black,
      muted: theme.colors.povDark2[6],
      line: theme.colors.povLine[6],
      deviation: theme.colors.povRed[9],
    };
    const generatedAt = new Date();
    const document =
      kind === "performance"
        ? reportDocument("Успеваемость обучаемых", performanceContent(scope, rows, palette), palette, generatedAt)
        : analyticsDocument(
            { scope, kpis, facts: data.facts, stats: rows, address, spelling: spellingStats, missed, stages, serviceName, generatedAt },
            palette,
          );

    setPdfPending(kind);
    try {
      await downloadPdf(document, reportFileName(kind === "performance" ? "Успеваемость" : "Аналитика", generatedAt, "pdf"));
    } catch {
      notifications.show({ title: "PDF не сформирован", message: "Не удалось собрать PDF. Повторите попытку.", color: "red" });
    } finally {
      setPdfPending(null);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Title order={2} size="h4" fw={600}>
          Аналитика
        </Title>
        <Button
          size="xs"
          variant="outline"
          color="povDark2.6"
          loading={pdfPending === "analytics"}
          disabled={data.pending || stats.length === 0}
          title="Отчёт по группе за период: показатели, успеваемость, ошибки, прогноз"
          onClick={() => void download("analytics", stats)}
        >
          Скачать PDF
        </Button>
      </Group>

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
          <KpiTiles current={kpis} previous={data.previousFacts === null ? null : periodKpis(data.previousFacts, misspelled)} />
          <div className={classes.cards}>
            <ErrorHeatmap stats={stats} facts={data.facts} />
            <PerformanceTable
              stats={stats}
              pdfPending={pdfPending === "performance"}
              onDownloadPdf={(rows) => void download("performance", rows)}
            />
            <GroupSides facts={data.facts} />
            <NormBars stats={stats} />
            <AddressErrors summary={address} />
            <SpellingBlock summary={spellingStats} failed={spelling.isError} />
            <MissedServices facts={data.facts} serviceName={serviceName} />
            <StatusTimes summary={stages} />
            <ForecastBlock stats={stats} />
          </div>
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
