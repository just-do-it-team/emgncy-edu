import { useEffect, useState } from "react";
import { Text } from "@mantine/core";
import { formatClockTime, formatLongDate } from "@/shared/lib";
import classes from "./app-shell.module.scss";

export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  const time = formatClockTime(now);

  return (
    <>
      <Text size="sm" c="white">
        {formatLongDate(now)}
      </Text>
      <Text size="lg" fw={600} c="white" className={classes.clock}>
        <time dateTime={now.toISOString()}>{time}</time>
      </Text>
    </>
  );
}
