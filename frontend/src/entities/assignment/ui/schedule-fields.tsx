import { Group, Stack, Text } from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import dayjs from "dayjs";
import { formatDateTime } from "@/shared/lib";
import { ASSIGNMENT_WINDOW_DAYS, assignmentWindow } from "../model/assignment-window";
import type { ScheduleValue } from "../model/lesson-schedule";

const PICKER_FORMAT = "YYYY-MM-DD HH:mm:ss";

function toPicker(value: string | null): string | null {
  return value === null ? null : dayjs(value).format(PICKER_FORMAT);
}

function fromPicker(value: string | null): string | null {
  return value === null || value === "" ? null : dayjs(value).toISOString();
}

interface ScheduleFieldsProps {
  value: ScheduleValue;
  now: number;
  error: string | undefined;
  onChange: (value: ScheduleValue) => void;
}

export function ScheduleFields({ value, now, error, onChange }: ScheduleFieldsProps) {
  const span = assignmentWindow(value.availableFrom, value.dueAt, now);

  return (
    <Stack gap={6}>
      <Group gap="sm" align="flex-start" wrap="wrap">
        <DateTimePicker
          size="xs"
          w={220}
          label="Выполнить с"
          placeholder="Сразу"
          clearable
          valueFormat="DD.MM.YYYY HH:mm"
          value={toPicker(value.availableFrom)}
          onChange={(next) => onChange({ ...value, availableFrom: fromPicker(next) })}
          data-path="availableFrom"
        />
        <DateTimePicker
          size="xs"
          w={220}
          label="Срок"
          placeholder={formatDateTime(new Date(span.due).toISOString())}
          clearable
          valueFormat="DD.MM.YYYY HH:mm"
          value={toPicker(value.dueAt)}
          onChange={(next) => onChange({ ...value, dueAt: fromPicker(next) })}
          error={error}
          data-path="dueAt"
        />
      </Group>
      <Text size="xs" c="povDark2.6">
        Без даты начала занятие доступно сразу; без срока — {ASSIGNMENT_WINDOW_DAYS} дней от начала, как считает сервер.
        Время — по часам этого компьютера.
      </Text>
    </Stack>
  );
}
