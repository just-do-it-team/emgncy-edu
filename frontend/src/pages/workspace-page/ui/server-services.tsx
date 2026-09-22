import { useState } from "react";
import {
  Alert,
  Button,
  Group,
  Popover,
  Select,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  allowedServiceStatuses,
  apiError,
  formatApiDate,
  statusLabels,
  trainingApi,
  type ApiCard,
  type CardService,
  type EmergencyService,
  type LaunchContext,
} from "@/entities/training";
import classes from "./incident-viewer.module.scss";

export function ServerServices({
  ctx,
  card,
  directory,
  readOnly,
  onStatus,
  onAdd,
}: {
  ctx: LaunchContext;
  card: ApiCard;
  directory: EmergencyService[];
  readOnly: boolean;
  onStatus: (
    service: CardService,
    status: string,
    comment: string,
  ) => Promise<void>;
  onAdd?: (serviceId: string) => Promise<void>;
}) {
  return (
    <Group gap="xs" align="start">
      {card.services
        .filter((s) => s.is_active && s.is_visible)
        .map((s) => (
          <ServerService
            key={s.id}
            ctx={ctx}
            service={s}
            info={directory.find((d) => d.id === s.service_id)}
            readOnly={readOnly}
            onStatus={onStatus}
          />
        ))}
      {!card.services.some((s) => s.is_active && s.is_visible) && (
        <Text size="sm">Службы не назначены</Text>
      )}
      {onAdd && (
        <AddService
          directory={directory.filter(
            (d) =>
              d.is_active &&
              !card.services.some((s) => s.is_active && s.service_id === d.id),
          )}
          readOnly={readOnly}
          onAdd={onAdd}
        />
      )}
    </Group>
  );
}
function ServerService({
  ctx,
  service,
  info,
  readOnly,
  onStatus,
}: {
  ctx: LaunchContext;
  service: CardService;
  info: EmergencyService | undefined;
  readOnly: boolean;
  onStatus: (
    service: CardService,
    status: string,
    comment: string,
  ) => Promise<void>;
}) {
  const [opened, setOpened] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [
      "student-api",
      ctx.userId,
      ctx.workspaceId,
      "service-history",
      service.id,
      service.current_status,
      service.added_at,
    ],
    queryFn: ({ signal }) =>
      trainingApi.serviceHistory(ctx, service.id, signal),
    enabled: opened,
    meta: { showGlobalError: false },
  });
  const editable =
    !readOnly && ctx.mode === "DDS" && !!info && info.code === ctx.positionCode;
  const options = editable
    ? allowedServiceStatuses(service.current_status, info.code)
    : [];
  const needsComment = status === "REJECTED" || status === "WORK_REFUSED";
  async function save() {
    if (
      busy ||
      !status ||
      !options.includes(status) ||
      (needsComment && !comment.trim())
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await onStatus(service, status, comment.trim());
      setStatus(null);
      setComment("");
      await query.refetch();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="top-start"
      width={410}
      withinPortal
      shadow="md"
    >
      <Popover.Target>
        <Button
          className={classes.service}
          onClick={() => setOpened(!opened)}
          aria-expanded={opened}
        >
          <span className={classes.serviceContent}>
            <span className={classes.serviceName}>
              {info?.name ?? "Служба"}
            </span>
            <span className={classes.serviceStatus}>
              {statusLabels[service.current_status] ?? service.current_status}
            </span>
          </span>
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Text fw={600}>{info?.name ?? "Служба"}</Text>
          <div style={{ maxHeight: 200, overflow: "auto" }}>
            {query.data?.map((item) => (
              <Text size="xs" key={item.id}>
                {formatApiDate(item.occurred_at)} ·{" "}
                {statusLabels[item.status_code] ?? item.status_code}
                {item.comment && ` — ${item.comment}`}
              </Text>
            ))}
          </div>
          {query.isPending && <Text size="xs">Загрузка истории…</Text>}
          {query.isError && (
            <Alert color="red">
              {apiError(query.error)}{" "}
              <Button
                size="xs"
                variant="subtle"
                onClick={() => void query.refetch()}
              >
                Повторить
              </Button>
            </Alert>
          )}
          {options.length > 0 ? (
            <>
              <Select
                label="Статус реагирования"
                value={status}
                onChange={setStatus}
                data={options.map((value) => ({
                  value,
                  label: statusLabels[value],
                }))}
                comboboxProps={{ withinPortal: false }}
                disabled={busy}
              />
              <Textarea
                label={needsComment ? "Причина отказа" : "Комментарий"}
                required={needsComment}
                value={comment}
                onChange={(e) => setComment(e.currentTarget.value)}
                maxLength={1999}
                disabled={busy}
              />
              <Button
                size="xs"
                loading={busy}
                disabled={
                  !status ||
                  !options.includes(status) ||
                  (needsComment && !comment.trim())
                }
                onClick={() => void save()}
              >
                Сохранить статус
              </Button>
            </>
          ) : (
            <Text size="xs" c="dimmed">
              {editable
                ? "Реагирование завершено"
                : "История реагирования. Изменения доступны ДДС назначенной службы."}
            </Text>
          )}
          {error && <Alert color="red">{error}</Alert>}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
function AddService({
  directory,
  readOnly,
  onAdd,
}: {
  directory: EmergencyService[];
  readOnly: boolean;
  onAdd: (id: string) => Promise<void>;
}) {
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function add() {
    if (!id || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(id);
      setId(null);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover position="top" withinPortal width={350}>
      <Popover.Target>
        <Button variant="white" disabled={readOnly}>
          Добавить службу
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack>
          <Select
            searchable
            label="Служба"
            data={directory.map((d) => ({ value: d.id, label: d.name }))}
            value={id}
            onChange={setId}
            comboboxProps={{ withinPortal: false }}
            disabled={readOnly || busy}
          />
          <Button
            disabled={!id || readOnly}
            loading={busy}
            onClick={() => void add()}
          >
            Добавить
          </Button>
          {error && <Alert color="red">{error}</Alert>}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
