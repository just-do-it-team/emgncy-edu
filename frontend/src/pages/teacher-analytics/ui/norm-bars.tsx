import { Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { CARD_OPEN_NORM_SECONDS, FIRST_ENTRY_NORM_SECONDS } from "@/shared/config";
import type { StudentStats } from "../model/student-stats";
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
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Время против норматива
        </Title>
        {rows.length === 0 ? (
          <Text size="sm" c="povDark2.6">
            Нет карточек ДДС с действиями обучаемых. Нормативы 30 с до открытия и 3 мин до первой записи есть только у
            диспетчера ДДС; блок заполнится после первой разобранной попытки с карточкой.
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md" verticalSpacing="sm">
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
        <Text size="xs" c="povDark2.6">
          Вертикальная черта — норматив, полоса — среднее время от выпуска карточки; красная — норматив превышен. Шкала
          до двух нормативов.
        </Text>
      </Stack>
    </Paper>
  );
}
