import { Text } from "@mantine/core";
import classes from "./criterion-row.module.scss";

interface CriterionRowProps {
  code: string;
  label: string;
  weight: number;
  value: number;
  points: number;
}

export function CriterionRow({ code, label, weight, value, points }: CriterionRowProps) {
  return (
    <div className={`${classes.criterionRow} ${value < 1 ? classes.criterionLost : ""}`}>
      <span>
        {code} · {label}
      </span>
      <span>{Math.round(weight * 100)} %</span>
      <span className={classes.criterionBar}>
        <span className={classes.criterionBarValue} style={{ width: `${value * 100}%` }} />
      </span>
      <Text size="xs" fw={700} ta="right">
        {points}
      </Text>
    </div>
  );
}
