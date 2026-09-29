import { Stack, Text } from "@mantine/core";
import { dispatchStageLabels, formatDuration, stagesConclusion, type StageSummary } from "../model/group-insights";
import { AnalyticsCard } from "./analytics-card";
import classes from "./analytics.module.scss";

const MINUTE_MS = 60_000;

export function StatusTimes({ summary }: { summary: StageSummary[] }) {
  const reached = summary.filter((stage) => stage.averageMs !== null);
  const scaleMs = Math.max(MINUTE_MS, ...reached.map((stage) => stage.averageMs ?? 0));
  const ticks = [0, scaleMs / 2, scaleMs];

  return (
    <AnalyticsCard
      title="Время по статусам ДДС"
      conclusion={stagesConclusion(summary)}
      actions={null}
      legend="Среднее время от статуса «Получена» (раскрытие карточки диспетчером) до первого перехода в статус; в скобках — по скольким карточкам посчитано. По журналу действий попыток."
      wide={false}
    >
      {reached.length === 0 ? (
        <Text size="sm" c="povDark2.6">
          Блок заполнится после разобранной попытки, где диспетчер ДДС раскрыл карточку.
        </Text>
      ) : (
        <Stack gap="sm">
          {summary.map((stage) => (
            <Stack key={stage.stage} gap={2}>
              <Text size="sm">
                «Получена» → «{dispatchStageLabels[stage.stage]}»:{" "}
                <span className={classes.numeric}>
                  {stage.averageMs === null ? "не доходили" : `${formatDuration(stage.averageMs)} (${stage.count})`}
                </span>
              </Text>
              <div
                className={classes.barTrack}
                role="img"
                aria-label={`${dispatchStageLabels[stage.stage]}: ${stage.averageMs === null ? "нет данных" : formatDuration(stage.averageMs)}`}
              >
                {stage.averageMs !== null && (
                  <div className={classes.barFill} style={{ width: `${(stage.averageMs / scaleMs) * 100}%` }} />
                )}
              </div>
            </Stack>
          ))}
          <div className={classes.axisScale} aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick}>{formatDuration(tick)}</span>
            ))}
          </div>
        </Stack>
      )}
    </AnalyticsCard>
  );
}
