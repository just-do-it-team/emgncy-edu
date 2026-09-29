import { Paper, SimpleGrid, Text } from "@mantine/core";
import type { PeriodKpis } from "../model/group-insights";
import classes from "./analytics.module.scss";

const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });
const PERCENT_POINTS = 100;

interface Tile {
  label: string;
  value: string;
  change: string;
}

type Metric = keyof PeriodKpis;

function tile(
  label: string,
  metric: Metric,
  current: PeriodKpis,
  previous: PeriodKpis | null,
  format: "count" | "score" | "share" | "decimal",
): Tile {
  const now = current[metric];
  const before = previous?.[metric] ?? null;
  const value =
    now === null ? "—" : format === "share" ? percent.format(now) : format === "count" ? String(now) : decimal.format(now);
  const change =
    previous === null
      ? "сравнение недоступно для всего времени"
      : now === null || before === null
        ? "в прошлом периоде данных нет"
        : format === "share"
          ? `${signed.format((now - before) * PERCENT_POINTS)} п. п. к прошлому периоду`
          : `${signed.format(now - before)} к прошлому периоду`;

  return { label, value, change };
}

interface KpiTilesProps {
  current: PeriodKpis;
  previous: PeriodKpis | null;
}

export function KpiTiles({ current, previous }: KpiTilesProps) {
  const tiles = [
    tile("Попыток", "attempts", current, previous, "count"),
    tile("Средний итоговый балл", "averageScore", current, previous, "score"),
    tile("Зачтено", "passShare", current, previous, "share"),
    tile("В нормативе 30 с / 3 мин", "normShare", current, previous, "share"),
    tile("Орфографических ошибок на попытку", "spellingPerAttempt", current, previous, "decimal"),
  ];

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 5 }} spacing="sm">
      {tiles.map((item) => (
        <Paper key={item.label} withBorder p="sm">
          <Text size="xs" c="povDark2.6">
            {item.label}
          </Text>
          <Text size="xl" fw={700} className={classes.numeric}>
            {item.value}
          </Text>
          <Text size="xs" c="povDark2.6">
            {item.change}
          </Text>
        </Paper>
      ))}
    </SimpleGrid>
  );
}
