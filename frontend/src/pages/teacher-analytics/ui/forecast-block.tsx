import { Group, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { Fact } from "@/shared/ui";
import { MAX_SCORE, MIN_INTERVAL_HALF_WIDTH, RELIABLE_BACKTEST_PAIRS, RISK_NORM_SHARE, SMOOTHING_LEVEL, SMOOTHING_TREND } from "../model/analytics-rules";
import { backtest, studentForecast, type BacktestPair } from "../model/forecast";
import type { StudentStats } from "../model/student-stats";
import classes from "./analytics.module.scss";

const score = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });
const ratio = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

const PLOT = 300;
const PAD = 32;
const MARKER = 6;
const TICKS = [0, 25, 50, 75, 100];

function toX(value: number): number {
  return PAD + (value / MAX_SCORE) * PLOT;
}

function toY(value: number): number {
  return PAD + PLOT - (value / MAX_SCORE) * PLOT;
}

function Scatter({ pairs }: { pairs: BacktestPair[] }) {
  return (
    <svg
      className={classes.scatter}
      viewBox={`0 0 ${PLOT + PAD * 2} ${PLOT + PAD * 2}`}
      role="img"
      aria-label={`Прогноз и факт по ${pairs.length} занятиям. Точка на диагонали — прогноз совпал с фактом`}
    >
      {TICKS.map((tick) => (
        <g key={tick}>
          <line className={classes.grid} x1={toX(0)} x2={toX(MAX_SCORE)} y1={toY(tick)} y2={toY(tick)} />
          <text className={classes.tick} x={PAD - 6} y={toY(tick) + 3} textAnchor="end">
            {tick}
          </text>
          <text className={classes.tick} x={toX(tick)} y={PAD + PLOT + 14} textAnchor="middle">
            {tick}
          </text>
        </g>
      ))}
      <line className={classes.axis} x1={toX(0)} x2={toX(0)} y1={toY(0)} y2={toY(MAX_SCORE)} />
      <line className={classes.axis} x1={toX(0)} x2={toX(MAX_SCORE)} y1={toY(0)} y2={toY(0)} />
      <line className={classes.diagonal} x1={toX(0)} y1={toY(0)} x2={toX(MAX_SCORE)} y2={toY(MAX_SCORE)} />
      {pairs.map((pair) => (
        <rect
          key={`${pair.studentId}:${pair.lessonKey}`}
          className={classes.point}
          x={toX(pair.predicted) - MARKER / 2}
          y={toY(pair.actual) - MARKER / 2}
          width={MARKER}
          height={MARKER}
        >
          <title>{`прогноз ${score.format(pair.predicted)}, факт ${score.format(pair.actual)}`}</title>
        </rect>
      ))}
      <text className={classes.tick} x={toX(MAX_SCORE / 2)} y={PAD + PLOT + 28} textAnchor="middle">
        прогноз
      </text>
      <text className={classes.tick} x={10} y={toY(MAX_SCORE / 2)} textAnchor="middle" transform={`rotate(-90 10 ${toY(MAX_SCORE / 2)})`}>
        факт
      </text>
    </svg>
  );
}

export function ForecastBlock({ stats }: { stats: StudentStats[] }) {
  const forecasts = stats
    .map((student) => ({ student, value: studentForecast(student.attempts) }))
    .sort((first, second) => Number(second.value.atRisk) - Number(first.value.atRisk) || first.student.name.localeCompare(second.student.name, "ru"));
  const summary = backtest(new Map(stats.map((student) => [student.studentId, student.attempts])));
  const better =
    summary.meanAbsoluteError !== null && summary.naiveMeanAbsoluteError !== null
      ? summary.meanAbsoluteError <= summary.naiveMeanAbsoluteError
      : null;

  return (
    <>
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={3} size="h5" fw={600}>
            Прогноз на следующее занятие
          </Title>
          <Table.ScrollContainer minWidth={640} type="native">
            <Table verticalSpacing="xs" fz="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Обучаемый</Table.Th>
                  <Table.Th>Ожидаемый балл</Table.Th>
                  <Table.Th>Интервал</Table.Th>
                  <Table.Th>Порог зачёта</Table.Th>
                  <Table.Th>Зона риска</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {forecasts.map(({ student, value }) => (
                  <Table.Tr key={student.studentId}>
                    <Table.Td className={classes.wrap}>{student.name}</Table.Td>
                    <Table.Td className={classes.numeric}>{value.forecast === null ? "—" : score.format(value.forecast.expected)}</Table.Td>
                    <Table.Td className={classes.numeric}>
                      {value.forecast === null ? "—" : `${score.format(value.forecast.low)}–${score.format(value.forecast.high)}`}
                    </Table.Td>
                    <Table.Td className={classes.numeric}>{value.passingScore ?? "—"}</Table.Td>
                    <Table.Td className={classes.wrap}>
                      {value.atRisk ? (
                        <Text size="sm" fw={600}>
                          да: {value.riskReason}
                        </Text>
                      ) : (
                        "нет"
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={3} size="h5" fw={600}>
            Прогноз ↔ факт
          </Title>
          {summary.pairs.length === 0 ? (
            <Text size="sm" c="povDark2.6">
              Сравнивать не с чем: нужен обучаемый хотя бы с двумя занятиями — прогноз по первому проверяется баллом
              второго.
            </Text>
          ) : (
            <Group align="flex-start" gap="xl" wrap="wrap">
              <Scatter pairs={summary.pairs} />
              <Stack gap="sm" maw={460}>
                <Group gap="xl" wrap="wrap">
                  <Fact label="Сравнено пар">{summary.pairs.length}</Fact>
                  <Fact label="Средняя ошибка прогноза">
                    {summary.meanAbsoluteError === null ? "—" : `${score.format(summary.meanAbsoluteError)} балла`}
                  </Fact>
                  <Fact label="Наивный прогноз">
                    {summary.naiveMeanAbsoluteError === null ? "—" : `${score.format(summary.naiveMeanAbsoluteError)} балла`}
                  </Fact>
                  <Fact label="Факт в интервале">{summary.coverage === null ? "—" : percent.format(summary.coverage)}</Fact>
                </Group>
                {better !== null && (
                  <Text size="sm">
                    {better
                      ? "Метод ошибается не больше, чем наивное среднее прошлых баллов."
                      : "Метод ошибается больше, чем наивное среднее прошлых баллов: на этой истории тренд мешает."}
                  </Text>
                )}
                {!summary.reliable && (
                  <Text size="sm" fw={600}>
                    Сравнено {summary.pairs.length} пар из нужных {RELIABLE_BACKTEST_PAIRS}: выводы предварительные.
                  </Text>
                )}
              </Stack>
            </Group>
          )}
          <Text size="xs" c="povDark2.6">
            Методика. Балл занятия — средний итоговый балл обучаемого в нём. Прогноз — экспоненциальное сглаживание с
            трендом (уровень {ratio.format(SMOOTHING_LEVEL)}, тренд {ratio.format(SMOOTHING_TREND)}); интервал — ± стандартное отклонение прошлых
            баллов, не уже {MIN_INTERVAL_HALF_WIDTH} баллов. Зона риска — прогноз ниже порога зачёта или нормативы соблюдаются реже чем в{" "}
            {percent.format(RISK_NORM_SHARE)} случаев. Проверка честная: прогноз на каждое занятие, кроме первого, строится
            только по предыдущим занятиям и сравнивается с фактом; «наивный» прогноз — среднее прошлых баллов. Точка на
            диагонали — прогноз совпал с фактом.
          </Text>
        </Stack>
      </Paper>
    </>
  );
}
