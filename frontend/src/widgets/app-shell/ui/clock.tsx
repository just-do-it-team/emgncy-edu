import { useEffect, useState } from "react";
import { Text } from "@mantine/core";
import classes from "./app-shell.module.scss";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  const time = now.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <>
      <Text size="sm" c="white">
        {dateFormatter.format(now)}
      </Text>
      <Text size="lg" fw={600} c="white" className={classes.clock}>
        <time dateTime={now.toISOString()}>{time}</time>
      </Text>
    </>
  );
}
