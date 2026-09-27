import { useState } from "react";
import {
  Accordion,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  notifyTrainingError,
  formatApiDate,
  statusLabels,
  trainingApi,
  trainingKeys,
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
  const query = useQuery({
    queryKey: trainingKeys.cardStatusHistory(ctx, card.id, card.version),
    queryFn: ({ signal }) =>
      trainingApi.cardStatusHistory(ctx, card.id, signal),
    enabled: !!opened,
    meta: { showGlobalError: false },
  });
  async function change() {
    if (busy || !status || readOnly) return;
    setBusy(true);
    try {
      await onChange(status, reason);
      setStatus(null);
      setReason("");
    } catch (err) {
      notifyTrainingError(err);
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
              <Button size="xs" onClick={() => void query.refetch()}>
                Повторить загрузку истории
              </Button>
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
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
