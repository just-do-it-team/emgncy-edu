import { useState } from "react";
import { Anchor, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { formatClockTime } from "@/shared/lib";
import { Button } from "@/shared/ui";
import type { AlarmSeverity, MonitorAlarm } from "../model/monitor";
import classes from "./lesson-monitor.module.scss";

const severityClass: Record<AlarmSeverity, string> = {
  high: classes.alarmHigh,
  medium: classes.alarmMedium,
  low: classes.alarmLow,
};

const severityLabels: Record<AlarmSeverity, string> = {
  high: "высокая важность",
  medium: "средняя важность",
  low: "низкая важность",
};

interface AlarmFeedProps {
  alarms: MonitorAlarm[];
  names: Map<string, string>;
  seen: ReadonlySet<string>;
  onSeen: (alarmId: string) => void;
  onOpen: (userId: string) => void;
}

export function AlarmFeed({ alarms, names, seen, onSeen, onOpen }: AlarmFeedProps) {
  const [showSeen, setShowSeen] = useState(false);
  const seenCount = alarms.filter((alarm) => seen.has(alarm.id)).length;
  const visible = showSeen ? alarms : alarms.filter((alarm) => !seen.has(alarm.id));

  return (
    <Paper withBorder>
      <Stack gap={0}>
        <Group justify="space-between" p="sm" gap="xs">
          <Title order={3} size="h5" fw={600}>
            Тревоги
          </Title>
          {seenCount > 0 && (
            <Anchor component="button" type="button" size="xs" c="povDark2.6" underline="always" onClick={() => setShowSeen((value) => !value)}>
              {showSeen ? "Скрыть просмотренные" : `Просмотренные: ${seenCount}`}
            </Anchor>
          )}
        </Group>

        <div className={classes.feed} aria-live="polite" aria-relevant="additions">
          {visible.length === 0 ? (
            <Stack gap={4} p="sm">
              <Text size="sm" fw={600}>
                {alarms.length === 0 ? "Тревог нет" : "Новых тревог нет"}
              </Text>
              <Text size="sm" c="povDark2.6">
                Здесь появятся нарушения нормативов, бездействие и прерванные попытки. Строки обучаемых справа
                обновляются сами.
              </Text>
            </Stack>
          ) : (
            visible.map((alarm) => {
              const wasSeen = seen.has(alarm.id);
              const name = names.get(alarm.userId) ?? "Обучаемый";

              return (
                <div key={alarm.id} className={`${classes.alarm} ${severityClass[alarm.severity]}`}>
                  <Group justify="space-between" gap="xs" wrap="nowrap">
                    <Text size="xs" c="povDark2.6" className={classes.numeric}>
                      {formatClockTime(new Date(alarm.at))} · {severityLabels[alarm.severity]}
                    </Text>
                    {wasSeen && (
                      <Text size="xs" c="povDark2.6">
                        просмотрено
                      </Text>
                    )}
                  </Group>
                  <Text size="sm" fw={600} c={wasSeen ? "povDark2.6" : undefined}>
                    {name}
                    {alarm.elementLabel ? ` · ${alarm.elementLabel}` : ""}
                  </Text>
                  <Text size="sm" c={wasSeen ? "povDark2.6" : undefined}>
                    {alarm.detail}
                  </Text>
                  <Group gap="xs" mt={4}>
                    <Button size="compact-xs" variant="outline" color="povDark2.6" onClick={() => onOpen(alarm.userId)}>
                      Открыть
                    </Button>
                    {!wasSeen && (
                      <Button size="compact-xs" variant="outline" color="povDark2.6" onClick={() => onSeen(alarm.id)}>
                        Отметить просмотренной
                      </Button>
                    )}
                  </Group>
                </div>
              );
            })
          )}
        </div>
      </Stack>
    </Paper>
  );
}
