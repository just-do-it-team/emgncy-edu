import { Text } from "@mantine/core";
import type { EmergencyService } from "@/shared/api";
import { formatDuration } from "../model/format";
import type { AlarmKind, ElementTimer, ParticipantRow, RowStatus } from "@/entities/monitoring";
import { positionText } from "../model/position";
import classes from "./lesson-monitor.module.scss";

const statusLabels: Record<RowStatus, string> = {
  running: "идёт",
  completed: "завершена",
  aborted: "прервана",
  not_started: "не начата",
};

const alarmLabels: Record<AlarmKind, string> = {
  open_norm: "просрочено открытие",
  first_entry_norm: "просрочена первая запись",
  idle: "бездействие",
  aborted: "попытка прервана",
};

const phaseLabels = {
  open: "до открытия",
  first_entry: "до первой записи",
} as const;

function TimerBlock({ timer }: { timer: ElementTimer }) {
  if (timer.phase === null || timer.limitMs === null) {
    return (
      <div className={classes.tileTimer}>
        <span className={classes.tileClock}>{formatDuration(timer.elapsedMs)}</span>
        <Text size="xs">прошло, норматива нет</Text>
      </div>
    );
  }

  const over = timer.elapsedMs > timer.limitMs;

  return (
    <div className={classes.tileTimer} data-level={timer.level}>
      <span className={classes.tileClock}>
        {over ? `+${formatDuration(timer.elapsedMs - timer.limitMs)}` : formatDuration(timer.limitMs - timer.elapsedMs)}
      </span>
      <Text size="xs">
        {over ? "превышен" : phaseLabels[timer.phase]} · норматив {formatDuration(timer.limitMs)}
      </Text>
    </div>
  );
}

interface ParticipantTilesProps {
  rows: ParticipantRow[];
  services: Map<string, EmergencyService> | undefined;
}

export function ParticipantTiles({ rows, services }: ParticipantTilesProps) {
  return (
    <div className={classes.tiles}>
      {rows.map((row) => {
        const kinds = [...new Set(row.alarms.map((alarm) => alarm.kind))];

        return (
          <section
            key={row.userId}
            className={classes.tile}
            data-overdue={row.status === "running" && row.timer?.level === "overdue" ? "" : undefined}
            aria-label={row.name}
          >
            <div>
              <Text className={classes.tileName} fw={600}>
                {row.name}
              </Text>
              <Text size="xs" c="povDark2.6">
                {positionText(row, services)}
              </Text>
              <Text size="xs" c="povDark2.6">
                Попытка {statusLabels[row.status]}
              </Text>
            </div>
            <Text size="sm">{row.timer?.elementLabel ?? "Текущего элемента нет"}</Text>
            {row.status === "running" && row.timer !== null && <TimerBlock timer={row.timer} />}
            <div className={classes.tileCounters}>
              <Text size="sm">Действий: {row.actionCount}</Text>
              <Text size="sm">Просрочек: {row.violations}</Text>
            </div>
            {kinds.length > 0 && (
              <div className={classes.tileAlarms}>
                {kinds.map((kind) => (
                  <Text key={kind} size="xs" className={classes.tileAlarm}>
                    {alarmLabels[kind]}
                  </Text>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
