import { Text, Tooltip } from "@mantine/core";
import { formatShortDateTime } from "@/shared/lib";
import { tooltipEvents } from "@/shared/ui";
import classes from "./schedule-cells.module.scss";

function formatSchedule(value: string | null): string {
  return value ? formatShortDateTime(value) : "—";
}

export function AssignedCell({ value }: { value: string }) {
  return (
    <Text size="sm" className={classes.numeric}>
      {formatSchedule(value)}
    </Text>
  );
}

export function WindowCell({ prefix, value }: { prefix: "с" | "до"; value: string | null }) {
  const text = formatSchedule(value);

  return (
    <Tooltip
      label={value ? `${prefix} ${text}` : `${prefix}: не задано`}
      events={tooltipEvents}
      color="povDark.6"
      radius={0}
    >
      <Text size="sm" tabIndex={0} className={`${classes.numeric} ${classes.focusable}`}>
        {text}
      </Text>
    </Tooltip>
  );
}
