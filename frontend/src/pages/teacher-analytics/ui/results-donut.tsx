import { Stack } from "@mantine/core";
import type { AttemptFacts } from "../model/student-stats";
import { AnalyticsCard } from "./analytics-card";
import classes from "./analytics.module.scss";

const SIZE = 200;
const RADIUS = 76;
const STROKE = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });

interface Segment {
  key: string;
  label: string;
  count: number;
  className: string;
}

export function ResultsDonut({ facts }: { facts: AttemptFacts[] }) {
  const passed = facts.filter((attempt) => attempt.passed === true).length;
  const failed = facts.filter((attempt) => attempt.passed === false).length;
  const segments: Segment[] = [
    { key: "passed", label: "Зачтено", count: passed, className: classes.segmentPrimary },
    { key: "failed", label: "Не зачтено", count: failed, className: classes.segmentAccent },
    { key: "open", label: "Без решения о зачёте", count: facts.length - passed - failed, className: classes.segmentLight },
  ];
  let offset = 0;

  return (
    <AnalyticsCard
      title="Итоги попыток"
      conclusion={`Зачтено ${passed} из ${facts.length} попыток (${percent.format(facts.length === 0 ? 0 : passed / facts.length)}).`}
      actions={null}
      legend="Итог — по оценке преподавателя, а без неё — по автоматической."
      wide={false}
    >
      <div className={classes.donut}>
        <svg className={classes.donutSvg} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Всего попыток: ${facts.length}`}>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {segments.map((segment) => {
              const length = facts.length === 0 ? 0 : (segment.count / facts.length) * CIRCUMFERENCE;
              const circle = (
                <circle
                  key={segment.key}
                  className={segment.className}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  strokeWidth={STROKE}
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                  strokeDashoffset={-offset}
                />
              );

              offset += length;
              return circle;
            })}
          </g>
          <text className={classes.donutTotal} x={SIZE / 2} y={SIZE / 2 + 4} textAnchor="middle">
            {facts.length}
          </text>
          <text className={classes.donutCaption} x={SIZE / 2} y={SIZE / 2 + 24} textAnchor="middle">
            попыток
          </text>
        </svg>
        <Stack gap={8}>
          {segments.map((segment) => (
            <div key={segment.key} className={classes.legendRow}>
              <svg className={classes.legendDot} viewBox="0 0 10 10" aria-hidden="true">
                <circle className={segment.className} cx={5} cy={5} r={5} strokeWidth={0} />
              </svg>
              <span>{segment.label}</span>
              <span className={classes.legendValue}>{segment.count}</span>
            </div>
          ))}
        </Stack>
      </div>
    </AnalyticsCard>
  );
}
