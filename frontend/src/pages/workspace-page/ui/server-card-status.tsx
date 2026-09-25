import { useState } from "react";
import {
  Accordion,
  Alert,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  apiError,
  notifyTrainingError,
  formatApiDate,
  statusLabels,
  trainingApi,
  type ApiCard,
  type LaunchContext,
} from "@/entities/training";

export function ServerCardStatus({
  ctx,
  card,
  readOnly,
  onChange,
}: {
  ctx: LaunchContext;
  card: ApiCard;
  readOnly: boolean;
  onChange: (status: string, reason: string) => Promise<void>;
}) {
  const [opened, setOpened] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: [
      "student-api",
      ctx.userId,
      ctx.workspaceId,
      "card-status-history",
      card.id,
      card.version,
    ],
    queryFn: ({ signal }) =>
      trainingApi.cardStatusHistory(ctx, card.id, signal),
    enabled: !!opened,
    meta: { showGlobalError: false },
  });
  async function change() {
    if (busy || !status || readOnly) return;
    setBusy(true);
    setError(null);
    try {
      await onChange(status, reason);
      setStatus(null);
      setReason("");
    } catch (err) {
      setError(notifyTrainingError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Accordion value={opened} onChange={setOpened}>
      <Accordion.Item value="status">
        <Accordion.Control>
          Статус карточки:{" "}
          {statusLabels[card.current_status] ?? card.current_status}
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap="xs">
            {query.data?.map((item) => (
              <Text size="xs" key={item.id}>
                {formatApiDate(item.set_at)} ·{" "}
                {statusLabels[item.status_code] ?? item.status_code}
                {item.reason ? ` — ${item.reason}` : ""}
              </Text>
            ))}
            {query.isPending && <Text size="xs">Загрузка истории…</Text>}
            {query.isError && (
              <Alert color="red">
                {apiError(query.error)}{" "}
                <Button size="xs" onClick={() => void query.refetch()}>
                  Повторить
                </Button>
              </Alert>
            )}
            {ctx.mode === "ARM112" && (
              <Group align="end">
                <Select
                  label="Новый статус"
                  data={["PROCESSED", "REFUSAL", "NOT_COMPLETED", "COMPLETED"]
                    .filter((v) => v !== card.current_status)
                    .map((value) => ({ value, label: statusLabels[value] }))}
                  value={status}
                  onChange={setStatus}
                  disabled={readOnly || busy}
                />
                <TextInput
                  label="Причина / комментарий"
                  value={reason}
                  onChange={(e) => setReason(e.currentTarget.value)}
                  disabled={readOnly || busy}
                />
                <Button
                  onClick={() => void change()}
                  loading={busy}
                  disabled={readOnly || !status}
                >
                  Изменить статус
                </Button>
              </Group>
            )}
            {error && <Alert color="red">{error}</Alert>}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
