import { useEffect, useState } from "react";
import { Alert, Button, Modal, Stack, Text } from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiError,
  trainingApi,
  type ApiCard,
  type EventKind,
  type EmergencyService,
  type LaunchContext,
  type ReferenceOption,
} from "@/entities/training";
import { CreateServerCard } from "./create-server-card";
import classes from "./workspace-page.module.scss";

export function IncomingCalls({
  ctx,
  active,
  reference,
  canCreate,
  onChanged,
  onBusyChange,
}: {
  ctx: LaunchContext;
  active: boolean;
  reference?: {
    types: ReferenceOption[];
    kinds: EventKind[];
    services: EmergencyService[];
  };
  canCreate: boolean;
  onChanged: () => Promise<void>;
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
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingCallId, setCreatingCallId] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [ringNotBefore, setRingNotBefore] = useState(() => Date.now() + 2000);
  const [ringDelayPassed, setRingDelayPassed] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(
      () => setRingDelayPassed(true),
      Math.max(0, ringNotBefore - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [ringNotBefore]);

  const ringingCall = calls.data?.find((call) => call.status === "RINGING");
  const activeCall = calls.data?.find(
    (call) => call.status === "ACTIVE" && !call.incident_card_id,
  );
  const linkedActiveCall = calls.data?.find(
    (call) => call.status === "ACTIVE" && !!call.incident_card_id,
  );
  useEffect(() => {
    if (active && activeCall && !creatingCallId) {
      setCreatingCallId(activeCall.id);
      setCardOpen(true);
    }
  }, [active, activeCall, creatingCallId]);

  async function act(
    callId: string,
    action: "answer" | "incident-card" | "complete",
    cardId?: string,
  ) {
    const updated = await trainingApi.callAction(ctx, callId, action, cardId);
    queryClient.setQueryData<typeof calls.data>(queryKey, (previous) =>
      previous?.map((call) => (call.id === updated.id ? updated : call)),
    );
    return updated;
  }

  async function answer(callId: string) {
    if (!active || busy || !calls.data) return;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      await act(callId, "answer");
      setCreatingCallId(callId);
      setCardOpen(true);
    } catch (reason) {
      setError(apiError(reason));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function created(card: ApiCard) {
    const callId = creatingCallId;
    if (!callId) throw new Error("Активный звонок не найден.");
    try {
      const currentCalls = await trainingApi.incomingCalls(ctx);
      queryClient.setQueryData(queryKey, currentCalls);
      const current = currentCalls.find((call) => call.id === callId);
      if (!current) throw new Error("Входящий звонок больше недоступен.");
      if (current.incident_card_id && current.incident_card_id !== card.id)
        throw new Error("К звонку привязана другая карточка.");
      if (current.status !== "COMPLETED") {
        if (current.status !== "ACTIVE")
          throw new Error("Звонок больше не активен.");
        if (!current.incident_card_id)
          await act(callId, "incident-card", card.id);
        await act(callId, "complete");
      }
    } catch (reason) {
      const message = `Карточка № ${card.card_number} сохранена. Не удалось завершить звонок; повторите сохранение. ${apiError(reason)}`;
      setError(message);
      throw new Error(message);
    }
    setCreatingCallId(null);
    setCardOpen(false);
    setRingDelayPassed(false);
    setRingNotBefore(Date.now() + 5000);
    setError(null);
    await onChanged();
  }

  async function completeLinkedCall() {
    if (!linkedActiveCall?.incident_card_id || busy) return;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      const card = await trainingApi.card(
        ctx,
        linkedActiveCall.incident_card_id,
      );
      if (card.current_status !== "PROCESSED")
        throw new Error("Карточка ещё не обработана.");
      await act(linkedActiveCall.id, "complete");
      setRingDelayPassed(false);
      setRingNotBefore(Date.now() + 5000);
      await onChanged();
    } catch (reason) {
      setError(apiError(reason));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <>
      {calls.isError && (
        <Alert color="red">
          Не удалось обновить входящие звонки. {apiError(calls.error)}{" "}
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
      {linkedActiveCall && !creatingCallId && (
        <Alert color="yellow">
          Карточка звонка сохранена, но завершение звонка не подтверждено.{" "}
          <Button
            variant="subtle"
            size="xs"
            loading={busy}
            onClick={() => void completeLinkedCall()}
          >
            Повторить завершение
          </Button>
        </Alert>
      )}
      {creatingCallId && !cardOpen && (
        <Alert color="blue">
          Работа со звонком не завершена.{" "}
          <Button variant="subtle" size="xs" onClick={() => setCardOpen(true)}>
            Вернуться к карточке
          </Button>
        </Alert>
      )}
      <Modal
        opened={
          ringDelayPassed && active && !!ringingCall && !creatingCallId && !busy
        }
        onClose={() => {}}
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        centered
        size="xl"
        title=""
        classNames={{
          content: classes.incomingCallModal,
          body: classes.incomingCallModalBody,
        }}
      >
        <Stack align="center" gap="sm" py="lg">
          <Text size="xl" fw={700}>
            Входящий звонок
          </Text>
          <Text size="lg" fw={600}>
            с номера {ringingCall?.caller_number ?? "не указан"}
          </Text>
          <Button
            size="lg"
            variant="outline"
            color="white"
            disabled={!canCreate}
            onClick={() => ringingCall && void answer(ringingCall.id)}
          >
            Принять
          </Button>
        </Stack>
      </Modal>
      {creatingCallId && reference && (
        <CreateServerCard
          opened={cardOpen}
          ctx={ctx}
          types={reference.types}
          kinds={reference.kinds}
          directory={reference.services}
          callId={creatingCallId}
          callerNumber={
            calls.data?.find((call) => call.id === creatingCallId)
              ?.caller_number
          }
          readOnly={
            !active ||
            !canCreate ||
            calls.isError ||
            !calls.data?.some(
              (call) => call.id === creatingCallId && call.status === "ACTIVE",
            )
          }
          onClose={() => {
            setCardOpen(false);
            onBusyChange(false);
            void onChanged();
          }}
          onCreated={created}
          onBusyChange={onBusyChange}
        />
      )}
    </>
  );
}
