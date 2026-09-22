import { useState } from "react";
import {
  Button,
  Group,
  Popover,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { ChevronUp } from "lucide-react";
import type { IncidentService } from "@/entities/incident";
import classes from "./incident-viewer.module.scss";

const statuses = [
  "Получена службой",
  "Принята",
  "Не принята",
  "Начало реагирования",
  "Прибытие",
  "Проведение работ",
  "Работы завершены",
  "Отказ от выполнения работ",
];

export function ServiceResponse({
  service,
  onChange,
}: {
  service: IncidentService;
  onChange: (service: IncidentService) => void;
}) {
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const needsComment =
    status === "Не принята" || status === "Отказ от выполнения работ";
  const history = service.history ?? [
    { status: service.status, time: service.time, comment: "" },
  ];
  function save() {
    if (!status || (needsComment && !comment.trim())) return;
    const time = new Date().toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    });
    onChange({
      ...service,
      status,
      time,
      history: [...history, { status, time, comment: comment.trim() }],
    });
    setStatus(null);
    setComment("");
  }
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="top-start"
      width={430}
      withinPortal
      shadow="md"
    >
      <Popover.Target>
        <Button
          className={classes.service}
          data-highlighted={opened || service.highlighted || undefined}
          aria-expanded={opened}
          aria-label={`Реагирование: ${service.name}`}
          onClick={() => setOpened((value) => !value)}
        >
          <span className={classes.serviceContent}>
            <ChevronUp size={11} />
            <span className={classes.serviceName}>{service.name}</span>
            <span className={classes.serviceStatus}>
              {service.time} {service.status}
            </span>
          </span>
        </Button>
      </Popover.Target>
      <Popover.Dropdown className={classes.responsePanel}>
        <Stack gap="sm">
          <Text fw={700} size="sm">
            {service.name}
          </Text>
          <div className={classes.responseHistory}>
            {history.map((entry, index) => (
              <div key={index} className={classes.responseEntry}>
                <time>{entry.time}</time>
                <div>
                  <strong>{entry.status}</strong>
                  {entry.comment && <div>{entry.comment}</div>}
                </div>
              </div>
            ))}
          </div>
          <Select
            label="Статус реагирования"
            placeholder="Выберите статус"
            data={statuses}
            value={status}
            onChange={setStatus}
            comboboxProps={{ withinPortal: false }}
          />
          <Textarea
            label={needsComment ? "Причина отказа" : "Комментарий"}
            required={needsComment}
            placeholder="Действия службы и результат"
            value={comment}
            onChange={(event) => setComment(event.currentTarget.value)}
            maxLength={1999}
            autosize
            minRows={2}
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              Учебное реагирование
            </Text>
            <Button
              size="xs"
              onClick={save}
              disabled={!status || (needsComment && !comment.trim())}
            >
              Сохранить статус
            </Button>
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
