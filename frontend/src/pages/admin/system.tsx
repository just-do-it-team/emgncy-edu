import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Button } from "@/shared/ui";
import { handleApiError } from "@/shared/api";
import {
  adminGet,
  adminPatch,
  adminPost,
  type Backup,
  type BackupStatus,
  type IntegrityReport,
  type PackageUpdate,
  type PasswordPolicy,
  type SecurityOverview,
  type Service,
  type UpdateStatus,
} from "./api";
import { Empty, QueryState, Section, Status } from "./common";
import { dateTime, metric } from "./format";

function commandResult(message: string) {
  notifications.show({ message, color: "green" });
}

export function AdminServicesPage() {
  const client = useQueryClient();
  const services = useQuery({
    queryKey: ["admin", "services"],
    queryFn: () => adminGet<Service[]>("/services"),
    refetchInterval: 15000,
  });
  const [pending, setPending] = useState<{
    name: string;
    action: "start" | "stop" | "restart";
  } | null>(null);
  const action = useMutation({
    mutationFn: () =>
      adminPost<void>(
        `/services/${encodeURIComponent(pending!.name)}/actions`,
        { action: pending!.action },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "services"] });
      setPending(null);
      commandResult("Команда выполнена");
    },
    onError: (error) => handleApiError(error, "Не удалось выполнить команду"),
  });
  return (
    <Section title="Сервисы">
      <QueryState
        pending={services.isPending}
        error={services.isError}
        onRetry={() => services.refetch()}
      />
      {services.data &&
        (services.data.length ? (
          <Paper withBorder>
            <ScrollArea>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Сервис</Table.Th>
                    <Table.Th>Адрес</Table.Th>
                    <Table.Th>Состояние</Table.Th>
                    <Table.Th>Проверен</Table.Th>
                    <Table.Th>Ошибка</Table.Th>
                    <Table.Th>Действия</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {services.data.map((item) => (
                    <Table.Tr key={`${item.name}-${item.instance}`}>
                      <Table.Td>{item.name}</Table.Td>
                      <Table.Td>{item.instance}</Table.Td>
                      <Table.Td>
                        <Status value={item.status} />
                      </Table.Td>
                      <Table.Td>{dateTime(item.last_checked_at)}</Table.Td>
                      <Table.Td>{item.error || "—"}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          {(["start", "stop", "restart"] as const).map(
                            (kind) => (
                              <Tooltip
                                key={kind}
                                label={
                                  item.actions_enabled
                                    ? kind
                                    : item.disabled_reason
                                }
                              >
                                <span>
                                  <Button
                                    size="xs"
                                    variant="outline"
                                    disabled={!item.actions_enabled}
                                    onClick={() =>
                                      setPending({
                                        name: item.name,
                                        action: kind,
                                      })
                                    }
                                  >
                                    {
                                      {
                                        start: "Запустить",
                                        stop: "Остановить",
                                        restart: "Перезапустить",
                                      }[kind]
                                    }
                                  </Button>
                                </span>
                              </Tooltip>
                            ),
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        ) : (
          <Empty text="Наблюдаемые сервисы не найдены" />
        ))}
      <Modal
        opened={!!pending}
        onClose={() => setPending(null)}
        title="Подтвердить действие"
        centered
      >
        <Stack>
          <Text size="sm">
            {pending?.action} · {pending?.name}
          </Text>
          <Button loading={action.isPending} onClick={() => action.mutate()}>
            Выполнить
          </Button>
        </Stack>
      </Modal>
    </Section>
  );
}

export function AdminBackupsPage() {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["admin", "backups", "status"],
    queryFn: () => adminGet<BackupStatus>("/backups/status"),
  });
  const backups = useQuery({
    queryKey: ["admin", "backups", "list"],
    queryFn: () => adminGet<Backup[]>("/backups"),
  });
  const [operation, setOperation] = useState<{
    type: "create" | "restore";
    id?: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const execute = useMutation({
    mutationFn: () =>
      adminPost<void>(
        operation?.type === "create"
          ? "/backups/actions/create"
          : `/backups/${encodeURIComponent(operation!.id!)}/actions/restore`,
        { reason: reason.trim() || null },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "backups"] });
      setOperation(null);
      setReason("");
      commandResult("Операция выполнена");
    },
    onError: (error) => handleApiError(error, "Не удалось выполнить операцию"),
  });
  return (
    <Stack gap="xl">
      <Section title="Резервное копирование">
        <QueryState
          pending={status.isPending}
          error={status.isError}
          onRetry={() => status.refetch()}
        />
        {status.data && (
          <>
            <Alert
              color={status.data.safe_mode ? "yellow" : "green"}
              title={
                status.data.safe_mode
                  ? "Безопасный режим"
                  : "Резервное копирование активно"
              }
            >
              {status.data.actions_enabled
                ? "Действия доступны"
                : status.data.disabled_reason}
            </Alert>
            <Paper withBorder p="md">
              <Stack gap="xs">
                <Text size="sm">
                  Настроено: {status.data.configured ? "да" : "нет"}
                </Text>
                <Text size="sm">
                  Расписание: {status.data.schedule || "Не задано"}
                </Text>
                <Text size="sm">
                  Хранилище: {status.data.destination || "Не задано"}
                </Text>
                <Text size="sm">
                  Последняя успешная копия:{" "}
                  {dateTime(status.data.last_successful_at)}
                </Text>
                <Tooltip
                  label={
                    status.data.actions_enabled
                      ? "Создать копию"
                      : status.data.disabled_reason
                  }
                >
                  <span style={{ alignSelf: "flex-start" }}>
                    <Button
                      disabled={!status.data.actions_enabled}
                      onClick={() => setOperation({ type: "create" })}
                    >
                      Создать копию
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Paper>
          </>
        )}
      </Section>
      <Section title="Доступные копии">
        <QueryState
          pending={backups.isPending}
          error={backups.isError}
          onRetry={() => backups.refetch()}
        />
        {backups.data &&
          (backups.data.length ? (
            <Paper withBorder>
              <ScrollArea>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Создана</Table.Th>
                      <Table.Th>Размер</Table.Th>
                      <Table.Th>Статус</Table.Th>
                      <Table.Th></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {backups.data.map((item) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>{item.id}</Table.Td>
                        <Table.Td>{dateTime(item.created_at)}</Table.Td>
                        <Table.Td>
                          {metric(item.size_bytes / 1024 / 1024, " МиБ")}
                        </Table.Td>
                        <Table.Td>
                          <Status value={item.status} />
                        </Table.Td>
                        <Table.Td>
                          <Tooltip
                            label={
                              status.data?.actions_enabled
                                ? "Восстановить"
                                : status.data?.disabled_reason
                            }
                          >
                            <span>
                              <Button
                                size="xs"
                                color="red"
                                variant="outline"
                                disabled={
                                  !status.data?.actions_enabled ||
                                  item.status !== "completed"
                                }
                                onClick={() =>
                                  setOperation({ type: "restore", id: item.id })
                                }
                              >
                                Восстановить
                              </Button>
                            </span>
                          </Tooltip>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
          ) : (
            <Empty text="Резервных копий нет" />
          ))}
      </Section>
      <Modal
        opened={!!operation}
        onClose={() => setOperation(null)}
        title={
          operation?.type === "restore" ? "Восстановить копию" : "Создать копию"
        }
        centered
      >
        <Stack>
          <Text size="sm">
            {operation?.type === "restore"
              ? `Восстановить копию ${operation.id}?`
              : "Создать резервную копию?"}
          </Text>
          <Textarea
            label="Причина"
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
          <Button
            color={operation?.type === "restore" ? "red" : undefined}
            loading={execute.isPending}
            onClick={() => execute.mutate()}
          >
            Подтвердить
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}

export function AdminUpdatesPage() {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["admin", "updates", "status"],
    queryFn: () => adminGet<UpdateStatus>("/updates/status"),
  });
  const packages = useQuery({
    queryKey: ["admin", "updates", "packages"],
    queryFn: () => adminGet<PackageUpdate[]>("/updates/packages"),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<"check" | "apply" | null>(null);
  const execute = useMutation({
    mutationFn: () =>
      adminPost<void>(
        confirm === "check"
          ? "/updates/actions/check"
          : "/updates/actions/apply",
        confirm === "check" ? {} : { packages: selected },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "updates"] });
      setConfirm(null);
      setSelected([]);
      commandResult("Команда выполнена");
    },
    onError: (error) => handleApiError(error, "Не удалось выполнить команду"),
  });
  return (
    <Section title="Обновления">
      <QueryState
        pending={status.isPending}
        error={status.isError}
        onRetry={() => status.refetch()}
      />
      {status.data && (
        <>
          <Alert
            color={status.data.actions_enabled ? "blue" : "yellow"}
            title={
              status.data.actions_enabled
                ? "Обновления доступны"
                : "Обновления отключены"
            }
          >
            {status.data.actions_enabled
              ? `Доступно пакетов: ${status.data.available_count ?? "нет данных"}`
              : status.data.disabled_reason}
          </Alert>
          <Text size="sm">
            Последняя проверка: {dateTime(status.data.last_checked_at)}
          </Text>
          <Tooltip
            label={
              status.data.actions_enabled
                ? "Проверить обновления"
                : status.data.disabled_reason
            }
          >
            <span style={{ alignSelf: "flex-start" }}>
              <Button
                disabled={!status.data.actions_enabled}
                onClick={() => setConfirm("check")}
              >
                Проверить обновления
              </Button>
            </span>
          </Tooltip>
        </>
      )}
      <QueryState
        pending={packages.isPending}
        error={packages.isError}
        onRetry={() => packages.refetch()}
      />
      {packages.data &&
        (packages.data.length ? (
          <>
            <Paper withBorder>
              <ScrollArea>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th></Table.Th>
                      <Table.Th>Пакет</Table.Th>
                      <Table.Th>Установлено</Table.Th>
                      <Table.Th>Доступно</Table.Th>
                      <Table.Th>Тип</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {packages.data.map((item) => (
                      <Table.Tr key={item.name}>
                        <Table.Td>
                          <Checkbox
                            aria-label={`Выбрать ${item.name}`}
                            disabled={!status.data?.actions_enabled}
                            checked={selected.includes(item.name)}
                            onChange={(event) =>
                              setSelected(
                                event.currentTarget.checked
                                  ? [...selected, item.name]
                                  : selected.filter(
                                      (name) => name !== item.name,
                                    ),
                              )
                            }
                          />
                        </Table.Td>
                        <Table.Td>{item.name}</Table.Td>
                        <Table.Td>{item.installed_version}</Table.Td>
                        <Table.Td>{item.available_version}</Table.Td>
                        <Table.Td>
                          {item.security_update ? "Безопасность" : "Обычное"}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Paper>
            <Button
              disabled={!status.data?.actions_enabled || selected.length === 0}
              onClick={() => setConfirm("apply")}
            >
              Установить выбранные
            </Button>
          </>
        ) : (
          <Empty text="Доступных обновлений нет" />
        ))}
      <Modal
        opened={!!confirm}
        onClose={() => setConfirm(null)}
        title="Подтвердить действие"
        centered
      >
        <Stack>
          <Text size="sm">
            {confirm === "check"
              ? "Проверить доступные обновления?"
              : `Установить выбранные пакеты (${selected.length})?`}
          </Text>
          <Button loading={execute.isPending} onClick={() => execute.mutate()}>
            Подтвердить
          </Button>
        </Stack>
      </Modal>
    </Section>
  );
}

type PolicyFields = Pick<
  PasswordPolicy,
  | "password_min_length"
  | "require_uppercase"
  | "require_lowercase"
  | "require_digit"
  | "require_special"
>;

export function AdminSecurityPage() {
  const client = useQueryClient();
  const overview = useQuery({
    queryKey: ["admin", "security", "overview"],
    queryFn: () => adminGet<SecurityOverview>("/security/overview"),
  });
  const policy = useQuery({
    queryKey: ["admin", "password-policy"],
    queryFn: () => adminGet<PasswordPolicy>("/security/policy"),
  });
  const integrity = useQuery({
    queryKey: ["admin", "security", "integrity"],
    queryFn: () => adminGet<IntegrityReport>("/security/integrity"),
  });
  const [changes, setChanges] = useState<Partial<PolicyFields>>({});
  const save = useMutation({
    mutationFn: () => adminPatch<PasswordPolicy>("/security/policy", changes),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin", "password-policy"] });
      setChanges({});
      commandResult("Парольная политика сохранена");
    },
    onError: (error) => handleApiError(error, "Не удалось сохранить политику"),
  });
  const value = (key: keyof PolicyFields) => changes[key] ?? policy.data?.[key];
  return (
    <Stack gap="xl">
      <Section title="Меры безопасности">
        <QueryState
          pending={overview.isPending}
          error={overview.isError}
          onRetry={() => overview.refetch()}
        />
        {overview.data && (
          <Stack gap="xs">
            {overview.data.controls.map((item) => (
              <Paper key={item.key} withBorder p="md">
                <Group justify="space-between">
                  <Text fw={600}>{item.title}</Text>
                  <Status
                    value={item.status}
                    label={
                      {
                        enabled: "Включено",
                        warning: "Внимание",
                        not_configured: "Не настроено",
                      }[item.status] ?? item.status
                    }
                  />
                </Group>
                <Text size="sm" c="dimmed">
                  {item.description}
                </Text>
              </Paper>
            ))}
          </Stack>
        )}
      </Section>
      <Section title="Парольная политика">
        <QueryState
          pending={policy.isPending}
          error={policy.isError}
          onRetry={() => policy.refetch()}
        />
        {policy.data && (
          <Paper withBorder p="md">
            <Stack gap="sm">
              <NumberInput
                label="Минимальная длина пароля"
                min={8}
                max={128}
                allowDecimal={false}
                allowNegative={false}
                value={Number(value("password_min_length"))}
                onChange={(next) => {
                  if (typeof next === "number")
                    setChanges({ ...changes, password_min_length: next });
                }}
              />
              <Checkbox
                label="Требовать заглавную букву"
                checked={Boolean(value("require_uppercase"))}
                onChange={(event) =>
                  setChanges({
                    ...changes,
                    require_uppercase: event.currentTarget.checked,
                  })
                }
              />
              <Checkbox
                label="Требовать строчную букву"
                checked={Boolean(value("require_lowercase"))}
                onChange={(event) =>
                  setChanges({
                    ...changes,
                    require_lowercase: event.currentTarget.checked,
                  })
                }
              />
              <Checkbox
                label="Требовать цифру"
                checked={Boolean(value("require_digit"))}
                onChange={(event) =>
                  setChanges({
                    ...changes,
                    require_digit: event.currentTarget.checked,
                  })
                }
              />
              <Checkbox
                label="Требовать специальный символ"
                checked={Boolean(value("require_special"))}
                onChange={(event) =>
                  setChanges({
                    ...changes,
                    require_special: event.currentTarget.checked,
                  })
                }
              />
              <Text size="xs" c="dimmed">
                Обновлено: {dateTime(policy.data.updated_at)}
              </Text>
              <Button
                style={{ alignSelf: "flex-start" }}
                disabled={
                  Object.keys(changes).length === 0 ||
                  !Number.isInteger(value("password_min_length")) ||
                  Number(value("password_min_length")) < 8 ||
                  Number(value("password_min_length")) > 128
                }
                loading={save.isPending}
                onClick={() => save.mutate()}
              >
                Сохранить
              </Button>
            </Stack>
          </Paper>
        )}
      </Section>
      <Section title="Проверка целостности">
        <QueryState
          pending={integrity.isPending}
          error={integrity.isError}
          onRetry={() => integrity.refetch()}
        />
        {integrity.data && (
          <Stack>
            <Group>
              <Status value={integrity.data.status} />
              <Text size="sm" c="dimmed">
                {dateTime(integrity.data.generated_at)}
              </Text>
            </Group>
            {integrity.data.checks.map((check) => (
              <Paper key={check.key} withBorder p="md">
                <Group justify="space-between">
                  <Text fw={600}>
                    {check.key === "database"
                      ? "База данных"
                      : check.key === "components"
                        ? "Обязательные компоненты"
                        : check.key}
                  </Text>
                  <Status value={check.status} />
                </Group>
                <Text size="sm">{check.details}</Text>
              </Paper>
            ))}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}
