import { Group, Paper, SimpleGrid, Text } from "@mantine/core";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { PeriodKpis } from "../model/group-insights";
import classes from "./analytics.module.scss";

const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });
const PERCENT_POINTS = 100;

type Metric = keyof PeriodKpis;
type Format = "count" | "decimal" | "share";

interface Tile {
  label: string;
  value: string;
  change: { text: string; up: boolean } | null;
}

function tile(label: string, metric: Metric, current: PeriodKpis, previous: PeriodKpis | null, format: Format): Tile {
  const now = current[metric];
  const before = previous?.[metric] ?? null;
  const value = now === null ? "—" : format === "share" ? percent.format(now) : format === "count" ? String(now) : decimal.format(now);

  // Стрелка — только когда есть с чем сравнить; нулевое изменение стрелкой не показывается.
  if (now === null || before === null || now === before) return { label, value, change: null };

  const delta = format === "share" ? (now - before) * PERCENT_POINTS : now - before;

  return {
    label,
    value,
    change: { text: `${signed.format(delta)}${format === "share" ? " п. п." : ""} к прошлому периоду`, up: delta > 0 },
  };
}

interface KpiTilesProps {
  current: PeriodKpis;
  previous: PeriodKpis | null;
}

export function KpiTiles({ current, previous }: KpiTilesProps) {
  const tiles = [
    tile("Попыток", "attempts", current, previous, "count"),
    tile("Средний итоговый балл", "averageScore", current, previous, "decimal"),
    tile("Зачтено", "passShare", current, previous, "share"),
    tile("В нормативе 30 с / 3 мин", "normShare", current, previous, "share"),
    tile("Орфографических ошибок на попытку", "spellingPerAttempt", current, previous, "decimal"),
  ];

  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 5 }} spacing="md">
      {tiles.map((item) => (
        <Paper key={item.label} withBorder p="md" className={classes.kpi}>
          <Text className={classes.kpiLabel}>{item.label}</Text>
          <Text className={classes.kpiValue}>{item.value}</Text>
          {item.change && (
            <Group gap={4} wrap="nowrap" className={classes.kpiChange}>
              {item.change.up ? <ArrowUp size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}
              <span>{item.change.text}</span>
            </Group>
          )}
        </Paper>
      ))}
    </SimpleGrid>
  );
}
