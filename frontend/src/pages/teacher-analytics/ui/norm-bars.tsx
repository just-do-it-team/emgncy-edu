import { SimpleGrid, Stack, Text } from "@mantine/core";
import { CARD_OPEN_NORM_SECONDS, FIRST_ENTRY_NORM_SECONDS } from "@/shared/config";
import { normsConclusion } from "../model/group-insights";
import type { StudentStats } from "../model/student-stats";
import { AnalyticsCard } from "./analytics-card";
import classes from "./analytics.module.scss";

const SECOND_MS = 1000;
const SCALE_NORMS = 2;
const seconds = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function averageSeconds(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length / SECOND_MS;
}

function Bar({ label, value, norm }: { label: string; value: number | null; norm: number }) {
  if (value === null) {
    return (
      <Text size="xs" c="povDark2.6">
        {label}: действий нет
      </Text>
    );
  }

  const over = value > norm;

  return (
    <Stack gap={2}>
      <Text size="xs">
        {label}: в среднем {seconds.format(value)} с при нормативе {norm} с
      </Text>
      <div className={classes.barTrack} role="img" aria-label={`${label}: ${seconds.format(value)} с при нормативе ${norm} с`}>
        <div
          className={classes.barFill}
          data-over={over || undefined}
          style={{ width: `${(Math.min(value / norm, SCALE_NORMS) / SCALE_NORMS) * 100}%` }}
        />
        <div className={classes.barNorm} />
      </div>
    </Stack>
  );
}

export function NormBars({ stats }: { stats: StudentStats[] }) {
  const rows = stats
    .map((student) => ({
      student,
      open: averageSeconds(student.attempts.flatMap((attempt) => attempt.norms?.openMs ?? [])),
      entry: averageSeconds(student.attempts.flatMap((attempt) => attempt.norms?.entryMs ?? [])),
    }))
    .filter((row) => row.open !== null || row.entry !== null)
    .sort((first, second) => first.student.name.localeCompare(second.student.name, "ru"));

  return (
    <AnalyticsCard
      title="Время против норматива"
      conclusion={normsConclusion(stats.flatMap((student) => student.attempts))}
      actions={null}
      legend="Вертикальная черта — норматив, полоса — среднее время от выпуска карточки; красная — норматив превышен. Шкала до двух нормативов."
      wide={false}
    >
      {rows.length === 0 ? (
        <Text size="sm" c="povDark2.6">
          Нормативы 30 с до открытия и 3 мин до первой записи есть только у диспетчера ДДС; блок заполнится после первой
          разобранной попытки с карточкой.
        </Text>
      ) : (
        <SimpleGrid cols={1} spacing="md" verticalSpacing="sm">
          {rows.map(({ student, open, entry }) => (
            <Stack key={student.studentId} gap={4}>
              <Text size="sm" fw={600}>
                {student.name}
              </Text>
              <Bar label="Открытие" value={open} norm={CARD_OPEN_NORM_SECONDS} />
              <Bar label="Первая запись" value={entry} norm={FIRST_ENTRY_NORM_SECONDS} />
            </Stack>
          ))}
        </SimpleGrid>
      )}
    </AnalyticsCard>
  );
}
