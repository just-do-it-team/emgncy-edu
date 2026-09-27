import { Group, Text } from "@mantine/core";
import { Phone, PhoneOff } from "lucide-react";
import type { Attempt } from "@/entities/attempt";
import { formatDateTimeSeconds } from "@/shared/lib";
import type { DiffRow } from "../model/card-diff";
import { formatPhone } from "../model/format-phone";
import { formatClock } from "../model/review-view";
import classes from "./attempt-review.module.scss";

const phoneFields = [
  { field: "phones.aon", label: "АОН" },
  { field: "phones.provided", label: "предоставленный" },
  { field: "phones.at_location", label: "телефон на место" },
];

interface CardStripProps {
  attempt: Attempt;
  rows: Map<string, DiffRow>;
  incidentNumber: string;
}

export function CardStrip({ attempt, rows, incidentNumber }: CardStripProps) {
  const phoneRows = phoneFields.map(({ field, label }) => ({ label, row: rows.get(field) }));
  const changed = phoneRows.some((item) => item.row?.changed);
  const exceeded = attempt.timings.fill.actual_seconds > attempt.timings.fill.norm_seconds;
  const clock = formatClock(attempt.timings.fill.actual_seconds);
  const aon = rows.get("phones.aon");
  const savedAt = formatDateTimeSeconds(attempt.completed_at);

  return (
    <div className={classes.cardStrip}>
      <div className={classes.hangup}>
        <PhoneOff size={20} aria-label="Сброс вызова" />
      </div>

      {changed ? (
        <div className={classes.phoneBlocks}>
          {phoneRows.map(({ label, row }) => (
            <div key={label} className={classes.phoneBlock}>
              <Text size="xs" c="var(--pov-label)">
                {label}
              </Text>
              <span className={classes.phoneValue}>
                {row?.submitted ? formatPhone(row.submitted) : "—"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className={classes.phoneSummary}>
          <Phone size={16} aria-hidden="true" />
          <Text fw={500} size="sm">
            Телефоны заявителя
          </Text>
          <Text size="sm" c="var(--pov-label)">
            совпадают с эталоном
          </Text>
          <Text size="sm">АОН {aon?.submitted ? formatPhone(aon.submitted) : "—"}</Text>
          <Text size="xs" c="var(--pov-label)">
            · предоставленный тот же · телефон на место не указан
          </Text>
        </div>
      )}

      <div className={classes.incidentBox}>
        <Text fw={700} size="sm">
          Происшествие {incidentNumber}
        </Text>
        <Text size="xs" c="var(--pov-label)">
          Сохр. {savedAt} · Опер. , АРМ {attempt.student.workstation_number}
        </Text>
      </div>

      <div className={`${classes.timer} ${exceeded ? classes.timerExceeded : ""}`}>
        <span className={classes.timerValue}>
          {clock.minutes}:{clock.seconds}
        </span>
        <Group className={classes.timerUnits} gap={0}>
          <span>минут</span>
          <span>секунд</span>
        </Group>
      </div>
    </div>
  );
}
