import { Group, Stack, Text } from "@mantine/core";
import {
  errorKindLabels,
  severityOrder,
  type Attempt,
  type AttemptError,
  type EkpFeatureConsequence,
  type ErrorSeverity,
} from "@/entities/attempt";
import { criterionCodes, criterionLabels } from "@/shared/config";
import { CriterionRow, ScoreBlock } from "@/shared/ui";
import type { Timeline } from "../model/timeline";
import classes from "./attempt-review.module.scss";

const itemClass: Record<ErrorSeverity, string> = {
  CRITICAL: classes.errorCritical,
  SIGNIFICANT: classes.errorSignificant,
  MINOR: classes.errorMinor,
};

function ekpFeatureOf(error: AttemptError): EkpFeatureConsequence | null {
  switch (error.kind) {
    case "MAIN_SERVICE_MISSED":
    case "SERVICE_MISSED":
    case "WRONG_INCIDENT_TYPE":
      return error.ekp_feature;
    default:
      return null;
  }
}

function SectionBar({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className={classes.sectionBar}>
      <span className={classes.sectionTitle}>{title}</span>
      {hint && <span className={classes.sectionHint}>{hint}</span>}
    </div>
  );
}

function clock(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

interface ReviewPanelProps {
  attempt: Attempt;
  timeline: Timeline;
  selectedErrorId: string | null;
  onSelectError: (errorId: string) => void;
}

export function ReviewPanel({
  attempt,
  timeline,
  selectedErrorId,
  onSelectError,
}: ReviewPanelProps) {
  const total = attempt.expert_review?.total ?? attempt.score.total;
  const sorted = [...attempt.errors].sort(
    (first, second) => severityOrder[first.severity] - severityOrder[second.severity],
  );
  const leading = sorted[0];
  const offsetByError = new Map(timeline.errors.map((mark) => [mark.errorId, mark]));
  const actionIndex = new Map(timeline.ticks.map((tick, index) => [tick.actionId, index + 1]));

  return (
    <div className={classes.panel}>
      <SectionBar title="Итог попытки" />
      <ScoreBlock value={total} caption={attempt.score.passed ? "ЗАЧТЕНО" : "НЕ ЗАЧТЕНО"}>
        {leading
          ? `${errorKindLabels[leading.kind]}: ${leading.explanation.split(".")[0]}`
          : "Ошибок не зафиксировано"}
      </ScoreBlock>

      <SectionBar title="Оценка по критериям" hint="веса из снимка попытки" />
      {criterionCodes.map((criterion) => (
        <CriterionRow
          key={criterion}
          code={criterion}
          label={criterionLabels[criterion]}
          weight={attempt.score.criteria[criterion].weight}
          value={attempt.score.criteria[criterion].value}
          points={attempt.score.criteria[criterion].points}
        />
      ))}

      <SectionBar title="Ошибки" hint={`${sorted.length}, по критичности`} />
      {sorted.length === 0 ? (
        <Text size="sm" p="sm">
          Ошибок не зафиксировано.
        </Text>
      ) : (
        sorted.map((error) => {
          const mark = offsetByError.get(error.error_id);
          const ekpFeature = ekpFeatureOf(error);

          return (
            <button
              key={error.error_id}
              type="button"
              className={`${classes.errorItem} ${itemClass[error.severity]} ${
                selectedErrorId === error.error_id ? classes.errorSelected : ""
              }`}
              onClick={() => onSelectError(error.error_id)}
            >
              <Stack gap={4}>
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Text fw={700} size="sm">
                    {errorKindLabels[error.kind]}
                  </Text>
                  <Text size="10px" c="var(--pov-label)">
                    {error.criterion} · {criterionLabels[error.criterion]}
                  </Text>
                </Group>

                <Text size="xs">{error.explanation}</Text>

                {ekpFeature && (
                  <Text size="xs" c="var(--pov-label)">
                    Признак ЕКП: {ekpFeature.feature_name} → {ekpFeature.consequence}
                  </Text>
                )}

                <Text size="10px" c="var(--pov-label)">
                  {mark
                    ? `${error.field} — ${clock(mark.offsetSeconds)} · действие ${actionIndex.get(mark.actionId)} из ${timeline.ticks.length}`
                    : `${error.field} — момент не определён`}
                </Text>
              </Stack>
            </button>
          );
        })
      )}
    </div>
  );
}
