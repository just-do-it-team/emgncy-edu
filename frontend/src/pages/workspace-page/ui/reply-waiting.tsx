import { useEffect, useState } from "react";
import { Text } from "@mantine/core";
import classes from "./workspace-page.module.scss";

const TICK_MS = 1000;
const REASSURE_AFTER_SECONDS = 5;

/**
 * Ожидание ответа собеседника: заявитель или бригада отвечают через синтез речи до 10–15 секунд,
 * и без счётчика это выглядит как зависание. Компонент монтируется на каждое ожидание заново,
 * поэтому отсчёт идёт от начала именно этого ожидания.
 */
export function ReplyWaiting() {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  const seconds = Math.floor((now - startedAt) / TICK_MS);

  return (
    <span className={classes.replyWaiting} role="status" aria-live="polite">
      <span>Собеседник отвечает… {seconds} с</span>
      {seconds >= REASSURE_AFTER_SECONDS && (
        <Text span size="xs" className={classes.replyHint}>
          Ответ может занять до 15 секунд, не завершайте звонок
        </Text>
      )}
    </span>
  );
}
