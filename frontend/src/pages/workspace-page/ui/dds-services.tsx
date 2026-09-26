import { useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Popover,
  Select,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronUp, Pencil, X } from "lucide-react";
import {
  allowedServiceStatuses,
  apiError,
  notifyTrainingError,
  statusLabels,
  trainingApi,
  type ApiCard,
  type CardService,
  type EmergencyService,
  type LaunchContext,
} from "@/entities/training";
import viewerClasses from "./incident-viewer.module.scss";
import classes from "./dds-services.module.scss";

type Props = {
  ctx: LaunchContext;
  card: ApiCard;
  directory: EmergencyService[];
  readOnly: boolean;
  onStatus: (
    service: CardService,
    status: string,
    comment: string,
  ) => Promise<void>;
};

function time(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

export function DdsServices({
  ctx,
  card,
  directory,
  readOnly,
  onStatus,
}: Props) {
  const services = card.services.filter(
    (service) => service.is_active && service.is_visible,
  );
  if (services.length === 0) return <Text size="sm">Службы не назначены</Text>;
  return (
    <Group gap={0} wrap="nowrap" className={classes.tiles}>
      {services.map((service) => (
        <DdsService
          key={service.id}
          ctx={ctx}
          service={service}
          info={directory.find((item) => item.id === service.service_id)}
          readOnly={readOnly}
          onStatus={onStatus}
        />
      ))}
    </Group>
  );
}

function DdsService({
  ctx,
  service,
  info,
  readOnly,
  onStatus,
}: {
  ctx: LaunchContext;
  service: CardService;
  info?: EmergencyService;
  readOnly: boolean;
  onStatus: Props["onStatus"];
}) {
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [unit, setUnit] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useQuery({
    queryKey: [
      "student-api",
      ctx.userId,
      ctx.workspaceId,
      "service-history",
      service.id,
      service.current_status,
    ],
    queryFn: ({ signal }) =>
      trainingApi.serviceHistory(ctx, service.id, signal),
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  const ownService = info?.code === ctx.positionCode;
  const awaitingReceipt = ["ADDED", "NOT_NOTIFIED"].includes(
    service.current_status,
  );
  const options =
    ownService && !readOnly && !awaitingReceipt
      ? allowedServiceStatuses(service.current_status, info.code)
      : [];
  const requiresReason = status === "REJECTED" || status === "WORK_REFUSED";
  const requiresComment = requiresReason || status === "WORK_COMPLETED";
  const latest = history.data?.at(-1);
  const currentStatusTime =
    service.current_status === "ADDED" ||
    service.current_status === "NOT_NOTIFIED"
      ? service.added_at
      : service.current_status === "RECEIVED"
        ? service.received_at
        : service.current_status === "ACCEPTED" ||
            service.current_status === "REJECTED"
          ? service.decided_at
          : service.current_status === "WORK_COMPLETED" ||
              service.current_status === "WORK_REFUSED"
            ? service.closed_at
            : null;
  const lastTime =
    latest?.status_code === service.current_status
      ? time(latest.occurred_at)
      : time(currentStatusTime);
  const name = info?.name ?? "Служба";

  async function save() {
    if (
      busy ||
      !status ||
      !options.includes(status) ||
      (requiresComment && !comment.trim())
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const note = unit.trim() ? `Наряд № ${unit.trim()}` : "";
      const fullComment = [note, comment.trim()].filter(Boolean).join(". ");
      await onStatus(service, status, fullComment);
      await history.refetch();
      setEditing(false);
      setStatus(null);
      setComment("");
    } catch (err) {
      setError(notifyTrainingError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Popover
        opened={opened}
        onChange={setOpened}
        position="top-start"
        width={560}
        withinPortal
        shadow="md"
      >
        <Popover.Target>
          <Button
            className={`${viewerClasses.service} ${classes.tile}`}
            data-highlighted={opened || undefined}
            aria-label={`${name}: ${statusLabels[service.current_status] ?? service.current_status}`}
            aria-expanded={opened}
            onClick={() => setOpened((value) => !value)}
          >
            <span className={viewerClasses.serviceContent}>
              <ChevronUp size={12} aria-hidden="true" />
              <span className={viewerClasses.serviceName}>{name}</span>
              <span className={viewerClasses.serviceStatus}>
                {lastTime}{" "}
                {statusLabels[service.current_status] ?? service.current_status}
              </span>
            </span>
          </Button>
        </Popover.Target>
        <Popover.Dropdown className={classes.historyPanel}>
          <Group justify="space-between" wrap="nowrap" mb="xs">
            <Text fw={700} size="sm">
              {name}
            </Text>
            {options.length > 0 && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="white"
                leftSection={<Pencil size={14} />}
                onClick={() => {
                  setError(null);
                  if (!unit) {
                    const previousUnit = history.data
                      ?.slice()
                      .reverse()
                      .find((entry) => entry.comment?.startsWith("Наряд № "))
                      ?.comment?.match(/^Наряд № ([^.]+)/)?.[1];
                    if (previousUnit) setUnit(previousUnit);
                  }
                  setEditing(true);
                }}
              >
                Изменить статус
              </Button>
            )}
          </Group>
          {history.isPending && <Text size="sm">Загрузка истории…</Text>}
          {history.isError && (
            <Alert color="red">
              {apiError(history.error)}{" "}
              <Button size="xs" onClick={() => void history.refetch()}>
                Повторить
              </Button>
            </Alert>
          )}
          <div className={classes.historyList}>
            {history.data?.map((entry) => (
              <div key={entry.id} className={classes.historyEntry}>
                <time dateTime={entry.occurred_at}>
                  {dateTime(entry.occurred_at)}
                </time>
                <strong>
                  {statusLabels[entry.status_code] ?? entry.status_code}
                </strong>
                {entry.comment && <span>{entry.comment}</span>}
              </div>
            ))}
          </div>
          {ownService && awaitingReceipt && !readOnly && (
            <Text size="xs" mt="xs">
              Подтверждаем получение карточки. После обновления статуса станет
              доступно решение.
            </Text>
          )}
          {ownService &&
            !awaitingReceipt &&
            !readOnly &&
            options.length === 0 && (
              <Text size="xs" mt="xs">
                Реагирование службы завершено.
              </Text>
            )}
        </Popover.Dropdown>
      </Popover>
      <Modal
        opened={editing}
        onClose={() => {
          if (!busy) setEditing(false);
        }}
        aria-label={`Статус реагирования: ${name}`}
        size="min(1160px, 94vw)"
        classNames={{
          inner: classes.editorInner,
          content: classes.editorContent,
        }}
        closeOnClickOutside={!busy}
        closeOnEscape={!busy}
        zIndex={1000}
      >
        <div className={classes.editorFields}>
          <Select
            aria-label="Статус реагирования"
            placeholder="Статус"
            data={options.map((value) => ({
              value,
              label: statusLabels[value] ?? value,
            }))}
            value={status}
            onChange={setStatus}
            disabled={busy}
            comboboxProps={{ withinPortal: true, zIndex: 1100 }}
          />
          <TextInput
            aria-label="Номер наряда"
            placeholder="Номер наряда"
            value={unit}
            onChange={(event) => setUnit(event.currentTarget.value)}
            maxLength={64}
            disabled={busy}
          />
          <Textarea
            aria-label={
              requiresReason
                ? "Причина отказа"
                : status === "WORK_COMPLETED"
                  ? "Результат работ"
                  : "Комментарий"
            }
            placeholder={
              requiresReason
                ? "Причина отказа (обязательно)"
                : status === "WORK_COMPLETED"
                  ? "Результат работ (обязательно)"
                  : "Комментарий"
            }
            required={requiresComment}
            value={comment}
            onChange={(event) => setComment(event.currentTarget.value)}
            maxLength={1999}
            autosize
            minRows={1}
            maxRows={4}
            disabled={busy}
          />
          <Group gap="xs" wrap="nowrap" align="end">
            <Button
              aria-label="Сохранить статус"
              title="Сохранить статус"
              loading={busy}
              disabled={
                !status ||
                !options.includes(status) ||
                (requiresComment && !comment.trim())
              }
              onClick={() => void save()}
            >
              <Check size={18} />
            </Button>
            <Button
              variant="default"
              aria-label="Отменить изменение"
              title="Отменить изменение"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              <X size={18} />
            </Button>
          </Group>
        </div>
        {(status === "WORK_COMPLETED" || status === "WORK_REFUSED") && (
          <Text size="xs" mt="xs" c="dimmed">
            После сохранения этого статуса реагирование службы завершится.
          </Text>
        )}
        {error && (
          <Alert color="red" mt="sm">
            {error}
          </Alert>
        )}
      </Modal>
    </>
  );
}
