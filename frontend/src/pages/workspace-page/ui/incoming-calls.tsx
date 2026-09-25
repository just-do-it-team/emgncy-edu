import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { PhoneOff } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiError,
  trainingApi,
  type ApiCard,
  type EmergencyService,
  type LaunchContext,
} from "@/entities/training";
import { CreateServerCard } from "./create-server-card";
import { useIncomingCallAudio } from "./use-incoming-call-audio";
import {
  createOperatorCard,
  type OperatorCardDraft,
  type OperatorCardEntry,
} from "../model/operator-cards";
import classes from "./workspace-page.module.scss";

export function IncomingCalls({
  ctx,
  active,
  reference,
  canCreate,
  onChanged,
  onBusyChange,
  onDraftChange,
  onCardOpenChange,
  openCardRequest,
}: {
  ctx: LaunchContext;
  active: boolean;
  reference?: {
    services: EmergencyService[];
  };
  canCreate: boolean;
  onChanged: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  onDraftChange: (draft: OperatorCardEntry | null) => void;
  onCardOpenChange: (open: boolean) => void;
  openCardRequest: number;
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
  const [draftEntry, setDraftEntry] = useState<OperatorCardEntry | null>(null);
  const [callEnded, setCallEnded] = useState(false);
  const [draftVisited, setDraftVisited] = useState(false);
  const [controlTarget, setControlTarget] = useState<HTMLElement | null>(null);
  const lastOpenRequest = useRef(openCardRequest);
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
  const unfinishedCall = calls.data?.find(
    (call) =>
      (call.status === "ACTIVE" || call.status === "COMPLETED") &&
      !call.incident_card_id,
  );
  const linkedActiveCall = calls.data?.find(
    (call) => call.status === "ACTIVE" && !!call.incident_card_id,
  );
  const currentCall = calls.data?.find((call) => call.id === creatingCallId);
  useEffect(() => {
    if (currentCall?.status === "COMPLETED") setCallEnded(true);
  }, [currentCall?.status]);
  const callAudio = useIncomingCallAudio(
    ctx,
    creatingCallId,
    active && currentCall?.status === "ACTIVE" && !callEnded,
  );
  useEffect(() => {
    setControlTarget(document.getElementById("workspace-call-controls"));
  }, []);
  useEffect(() => {
    onDraftChange(draftVisited ? draftEntry : null);
  }, [draftEntry, draftVisited, onDraftChange]);
  useEffect(() => {
    onCardOpenChange(cardOpen);
  }, [cardOpen, onCardOpenChange]);
  useEffect(() => {
    if (active && unfinishedCall && !creatingCallId && !busy) {
      setCreatingCallId(unfinishedCall.id);
      const next = createOperatorCard();
      next.draft.aon = unfinishedCall.caller_number ?? "";
      next.incident.serviceStatus = "Черновик";
      setDraftEntry(next);
      setDraftVisited(false);
      setCallEnded(unfinishedCall.status === "COMPLETED");
    }
  }, [active, unfinishedCall, creatingCallId, busy]);
  useEffect(() => {
    if (lastOpenRequest.current === openCardRequest) return;
    if (!creatingCallId || !draftEntry || !reference || !canCreate) return;
    lastOpenRequest.current = openCardRequest;
    setDraftVisited(true);
    setCardOpen(true);
  }, [openCardRequest, creatingCallId, draftEntry, reference, canCreate]);

  const updateDraft = useCallback((draft: OperatorCardDraft) => {
    setDraftEntry((entry) =>
      entry
        ? {
            draft: structuredClone(draft),
            incident: {
              ...entry.incident,
              description: draft.description,
              address:
                draft.address.descriptive ||
                [draft.address.street, draft.address.house]
                  .filter(Boolean)
                  .join(", "),
            },
          }
        : entry,
    );
  }, []);

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
      const next = createOperatorCard();
      next.draft.aon =
        calls.data.find((call) => call.id === callId)?.caller_number ?? "";
      next.incident.serviceStatus = "Черновик";
      setDraftEntry(next);
      setCallEnded(false);
      setDraftVisited(false);
    } catch (reason) {
      setError(apiError(reason));
      void calls.refetch();
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  async function hangUp() {
    if (!creatingCallId || busy || callEnded) return;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      await act(creatingCallId, "complete");
      setCallEnded(true);
      await onChanged();
    } catch (reason) {
      setError(apiError(reason));
      void calls.refetch();
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
      if (current.status !== "ACTIVE" && current.status !== "COMPLETED")
        throw new Error("Звонок больше недоступен.");
      if (!current.incident_card_id)
        await act(callId, "incident-card", card.id);
      if (current.status === "ACTIVE") await act(callId, "complete");
    } catch (reason) {
      const message = `Карточка № ${card.card_number} сохранена. Не удалось связать её со звонком или подтвердить его завершение; повторите сохранение. ${apiError(reason)}`;
      setError(message);
      throw new Error(message);
    }
    setCreatingCallId(null);
    setDraftEntry(null);
    setDraftVisited(false);
    setCardOpen(false);
    setCallEnded(false);
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
      {controlTarget &&
        creatingCallId &&
        currentCall &&
        createPortal(
          <Group gap="xs" wrap="nowrap" className={classes.callControls}>
            <div className={classes.callControlMessage}>
              <Text size="sm" fw={600}>
                {callEnded || currentCall.status === "COMPLETED"
                  ? "Разговор завершён"
                  : callAudio.status}
              </Text>
              {callAudio.error && !callEnded && (
                <Text size="xs" c="red" role="alert">
                  {callAudio.error}
                </Text>
              )}
              {error && (
                <Text size="xs" c="red" role="alert">
                  {error}
                </Text>
              )}
            </div>
            {callAudio.error && !callEnded && (
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={callAudio.retry}
              >
                Повторить подключение
              </Button>
            )}
            <Button
              size="compact-sm"
              color="red"
              leftSection={<PhoneOff size={16} />}
              disabled={callEnded || busy || currentCall.status !== "ACTIVE"}
              onClick={() => void hangUp()}
            >
              Положить трубку
            </Button>
          </Group>,
          controlTarget,
        )}
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
      {error && !currentCall && <Alert color="red">{error}</Alert>}
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
      {creatingCallId && reference && draftEntry && (
        <CreateServerCard
          opened={cardOpen}
          entry={draftEntry}
          ctx={ctx}
          directory={reference.services}
          callId={creatingCallId}
          callerNumber={
            calls.data?.find((call) => call.id === creatingCallId)
              ?.caller_number
          }
          callEnded={callEnded}
          onHangUp={() => void hangUp()}
          readOnly={
            !active ||
            !canCreate ||
            calls.isError ||
            !calls.data?.some(
              (call) =>
                call.id === creatingCallId &&
                (call.status === "ACTIVE" || call.status === "COMPLETED"),
            )
          }
          onClose={() => {
            setCardOpen(false);
            onBusyChange(false);
            void onChanged();
          }}
          onDraftChange={updateDraft}
          onCreated={created}
          onBusyChange={onBusyChange}
        />
      )}
    </>
  );
}
