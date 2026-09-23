import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiError,
  trainingApi,
  type ApiCard,
  type CardListItem,
  type EventKind,
  type LaunchContext,
  type ReferenceOption,
} from "@/entities/training";
import { CreateServerCard } from "./create-server-card";

const callLabels: Record<string, string> = {
  PENDING: "Ожидается",
  RINGING: "Входящий звонок",
  ACTIVE: "Принят",
  COMPLETED: "Завершён",
  FAILED: "Ошибка",
  CANCELLED: "Отменён",
};

export function IncomingCalls({
  ctx,
  active,
  cards,
  reference,
  canCreate,
  onChanged,
  onOpenCard,
  onBusyChange,
}: {
  ctx: LaunchContext;
  active: boolean;
  cards: CardListItem[];
  reference?: { types: ReferenceOption[]; kinds: EventKind[] };
  canCreate: boolean;
  onChanged: () => Promise<void>;
  onOpenCard: (id: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = [
    "student-api",
    ctx.userId,
    ctx.workspaceId,
    "incoming-calls",
    ctx.sessionId,
  ];
  const calls = useQuery({
    queryKey,
    queryFn: ({ signal }) => trainingApi.incomingCalls(ctx, signal),
    refetchInterval: 5000,
    meta: { showGlobalError: false },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ callId: string | null } | null>(
    null,
  );
  const [selected, setSelected] = useState<Record<string, string | null>>({});
  const [createdCards, setCreatedCards] = useState<ApiCard[]>([]);
  const disabled = !active || busy || calls.isError || !calls.data;
  const linked = new Set(
    calls.data?.flatMap((call) =>
      call.incident_card_id ? [call.incident_card_id] : [],
    ) ?? [],
  );
  const options = new Map(
    cards.map((card) => [
      card.card_id,
      {
        value: card.card_id,
        label: `№ ${card.card_number} · ${card.incident_address ?? "Без адреса"}`,
      },
    ]),
  );
  for (const card of createdCards)
    options.set(card.id, {
      value: card.id,
      label: `№ ${card.card_number} · ${card.incident_address ?? "Без адреса"}`,
    });

  async function act(
    callId: string,
    action: "answer" | "incident-card" | "complete",
    cardId?: string,
  ) {
    if (disabled) return false;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      if (action === "incident-card" && cardId) {
        const card = await trainingApi.card(ctx, cardId);
        if (card.operator_id !== ctx.userId)
          throw new Error(
            "Выберите карточку, которую создали вы. Карточки сценария нельзя привязать к звонку.",
          );
      }
      const updated = await trainingApi.callAction(ctx, callId, action, cardId);
      queryClient.setQueryData<typeof calls.data>(queryKey, (previous) =>
        previous?.map((call) => (call.id === updated.id ? updated : call)),
      );
      return true;
    } catch (err) {
      setError(apiError(err));
      return false;
    } finally {
      await onChanged();
      setBusy(false);
      onBusyChange(false);
    }
  }
  function startCreate(callId: string | null) {
    setCreating({ callId });
    setError(null);
    onBusyChange(true);
  }
  async function created(card: ApiCard) {
    const callId = creating?.callId;
    setCreatedCards((previous) => [...previous, card]);
    setCreating(null);
    if (callId) {
      setSelected((previous) => ({ ...previous, [callId]: card.id }));
      if (!(await act(callId, "incident-card", card.id))) {
        setError(
          (previous) =>
            `Карточка № ${card.card_number} создана, но привязка к звонку не подтверждена. Обновите звонки и при необходимости нажмите «Привязать». ${previous ?? ""}`,
        );
      }
    } else {
      await onChanged();
    }
    onBusyChange(false);
    onOpenCard(card.id);
  }
  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600}>Учебные звонки</Text>
        <Button
          size="xs"
          disabled={!active || busy || !canCreate || !!creating}
          onClick={() => startCreate(null)}
        >
          Создать карточку
        </Button>
      </Group>
      {calls.isPending && <Loader size="sm" />}
      {calls.isError && (
        <Alert color="red">
          Не удалось обновить звонки. {apiError(calls.error)}{" "}
          <Button
            variant="subtle"
            size="xs"
            onClick={() => void calls.refetch()}
          >
            Повторить
          </Button>
        </Alert>
      )}
      {error && <Alert color="red">{error}</Alert>}
      {calls.data?.length === 0 && (
        <Text size="sm" c="dimmed">
          В этом занятии нет учебных звонков.
        </Text>
      )}
      {calls.data?.map((call, index) => (
        <Paper key={call.id} withBorder p="sm">
          <Stack gap="xs">
            <Group justify="space-between">
              <Group>
                <Text size="sm">Звонок {index + 1}</Text>
                <Badge color={call.status === "RINGING" ? "orange" : undefined}>
                  {callLabels[call.status] ?? call.status}
                </Badge>
              </Group>
              <Group>
                {call.status === "RINGING" && (
                  <Button
                    size="xs"
                    disabled={disabled}
                    onClick={() => void act(call.id, "answer")}
                  >
                    Принять звонок
                  </Button>
                )}
                {call.incident_card_id && (
                  <Button
                    size="xs"
                    variant="default"
                    disabled={busy}
                    onClick={() => onOpenCard(call.incident_card_id!)}
                  >
                    Открыть карточку
                  </Button>
                )}
                {call.status === "ACTIVE" && (
                  <Button
                    size="xs"
                    disabled={disabled || !call.incident_card_id}
                    onClick={() => void act(call.id, "complete")}
                  >
                    Завершить звонок
                  </Button>
                )}
              </Group>
            </Group>
            {call.status === "ACTIVE" && !call.incident_card_id && (
              <>
                <Text size="xs">
                  Создайте карточку или выберите ранее созданную вами. Для
                  завершения звонка карточка должна быть привязана.
                </Text>
                <Group align="end">
                  <Button
                    size="xs"
                    disabled={disabled || !canCreate}
                    onClick={() => startCreate(call.id)}
                  >
                    Создать карточку для звонка
                  </Button>
                  <Select
                    style={{ flex: 1 }}
                    label="Ранее созданная карточка"
                    placeholder="Выберите из списка"
                    searchable
                    clearable
                    disabled={disabled}
                    data={[...options.values()].filter(
                      (option) => !linked.has(option.value),
                    )}
                    value={selected[call.id] ?? null}
                    onChange={(value) =>
                      setSelected((previous) => ({
                        ...previous,
                        [call.id]: value,
                      }))
                    }
                  />
                  <Button
                    size="xs"
                    variant="default"
                    disabled={disabled || !selected[call.id]}
                    onClick={() =>
                      void act(
                        call.id,
                        "incident-card",
                        selected[call.id] ?? undefined,
                      )
                    }
                  >
                    Привязать
                  </Button>
                </Group>
                <Text size="xs" c="dimmed">
                  Если нужной карточки нет, обновите список или нажмите
                  «Загрузить ещё» под таблицей карточек.
                </Text>
              </>
            )}
            {(call.status === "FAILED" || call.status === "CANCELLED") && (
              <Text size="sm" c="red">
                Этот звонок блокирует завершение занятия. Обратитесь к
                преподавателю.
              </Text>
            )}
          </Stack>
        </Paper>
      ))}
      {creating && reference && (
        <CreateServerCard
          ctx={ctx}
          types={reference.types}
          kinds={reference.kinds}
          readOnly={
            !active ||
            !canCreate ||
            (!!creating.callId &&
              (calls.isError ||
                !calls.data?.some(
                  (call) =>
                    call.id === creating.callId &&
                    call.status === "ACTIVE" &&
                    !call.incident_card_id,
                )))
          }
          onClose={() => {
            setCreating(null);
            onBusyChange(false);
            void onChanged();
          }}
          onCreated={(card) => void created(card)}
        />
      )}
    </Stack>
  );
}
