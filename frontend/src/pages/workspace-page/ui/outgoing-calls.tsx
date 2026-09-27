import { useEffect, useState } from "react";
import { Button, Group, Text } from "@mantine/core";
import { Clock3, PhoneCall, PhoneOff } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiError,
  notifyTrainingError,
  trainingApi,
  type LaunchContext,
  type OutgoingCall,
} from "@/entities/training";
import { useIncomingCallAudio } from "./use-incoming-call-audio";
import classes from "./workspace-page.module.scss";

function callDuration(startedAt: string | null, completedAt: string | null) {
  const start = Date.parse(startedAt ?? "");
  if (!Number.isFinite(start)) return "00:00";
  const end = Date.parse(completedAt ?? "") || Date.now();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function OutgoingCalls({
  ctx,
  cardId,
  active,
  onChanged,
  onBusyChange,
}: {
  ctx: LaunchContext;
  cardId: string | null;
  active: boolean;
  onChanged: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = [
    "student-api",
    ctx.userId,
    ctx.workspaceId,
    "outgoing-call",
    cardId,
  ];
  const callQuery = useQuery({
    queryKey,
    queryFn: ({ signal }) => trainingApi.outgoingCall(ctx, cardId!, signal),
    enabled: !!cardId,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  const [ongoingCall, setOngoingCall] = useState<OutgoingCall | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setClockTick] = useState(0);

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  useEffect(() => {
    const fetched = callQuery.data;
    if (!fetched) return;
    setOngoingCall((current) => {
      if (fetched.status === "ACTIVE") return fetched;
      return current?.id === fetched.id ? null : current;
    });
  }, [callQuery.data]);
  useEffect(() => setError(null), [cardId]);

  const call =
    ongoingCall?.status === "ACTIVE" ? ongoingCall : (callQuery.data ?? null);
  const talking = call?.status === "ACTIVE";
  const audio = useIncomingCallAudio(
    ctx,
    call?.id ?? null,
    active && talking,
    "руководителя бригады",
    "руководитель бригады",
  );

  useEffect(() => {
    if (!talking) return;
    const timer = window.setInterval(
      () => setClockTick((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [talking]);

  async function start() {
    if (!cardId || !active || busy || talking) return;
    setBusy(true);
    setError(null);
    try {
      const started = await trainingApi.startOutgoingCall(ctx, cardId);
      queryClient.setQueryData(queryKey, started);
      setOngoingCall(started.status === "ACTIVE" ? started : null);
      await onChanged();
    } catch (cause) {
      setError(notifyTrainingError(cause));
      void callQuery.refetch();
    } finally {
      setBusy(false);
    }
  }

  async function hangUp() {
    if (!call || !talking || busy) return;
    setBusy(true);
    setError(null);
    try {
      const completed = await trainingApi.completeOutgoingCall(ctx, call.id);
      setOngoingCall(null);
      queryClient.setQueryData(
        [
          "student-api",
          ctx.userId,
          ctx.workspaceId,
          "outgoing-call",
          completed.incident_card_id,
        ],
        completed,
      );
      await onChanged();
    } catch (cause) {
      setError(notifyTrainingError(cause));
      void callQuery.refetch();
    } finally {
      setBusy(false);
    }
  }

  const status =
    call?.status === "COMPLETED"
      ? "Разговор завершён · проставьте статус службы в карточке"
      : talking
        ? audio.status
        : cardId && callQuery.isPending
          ? "Загрузка состояния звонка…"
          : cardId && callQuery.isError
            ? "Не удалось получить состояние звонка"
            : cardId
              ? "Изучите карточку и позвоните бригаде"
              : "Откройте карточку для звонка бригаде";

  return (
    <Group
      gap="sm"
      wrap="nowrap"
      className={classes.callControls}
      data-call-state={
        error || (!talking && callQuery.isError) || (talking && audio.error)
          ? "error"
          : call?.status === "COMPLETED"
            ? "ended"
            : "active"
      }
      aria-label="Исходящий звонок бригаде"
    >
      <div className={classes.callIdentity}>
        <span className={classes.callIcon} aria-hidden="true">
          <PhoneCall size={20} />
        </span>
        <div className={classes.callIdentityText}>
          <span className={classes.callEyebrow}>Исходящий звонок</span>
          <Text className={classes.callNumber}>
            Бригада {ctx.positionCode ?? "службы"}
          </Text>
        </div>
      </div>
      <div className={classes.callControlMessage}>
        <Text size="sm" fw={600} className={classes.callStatus}>
          <span className={classes.callStatusDot} aria-hidden="true" />
          {status}
        </Text>
        {(error ||
          (talking && audio.error) ||
          (cardId && !talking && callQuery.isError)) && (
          <Text size="xs" className={classes.callError} role="alert">
            {error || audio.error || apiError(callQuery.error)}
          </Text>
        )}
      </div>
      {call && (
        <div className={classes.callTimer} aria-label="Длительность разговора">
          <Clock3 size={16} aria-hidden="true" />
          <div>
            <span className={classes.callTimerLabel}>Время разговора</span>
            <time className={classes.callDuration}>
              {callDuration(call.answered_at, call.completed_at)}
            </time>
          </div>
        </div>
      )}
      <div className={classes.callActions}>
        {cardId && callQuery.isError && !talking && (
          <Button
            size="compact-xs"
            variant="subtle"
            className={classes.callRetry}
            onClick={() => void callQuery.refetch()}
          >
            Повторить загрузку
          </Button>
        )}
        {talking ? (
          <>
            {audio.error && (
              <Button
                size="compact-xs"
                variant="subtle"
                className={classes.callRetry}
                onClick={audio.retry}
              >
                Повторить подключение
              </Button>
            )}
            <Button
              size="sm"
              color="red"
              className={classes.callHangup}
              leftSection={<PhoneOff size={16} />}
              loading={busy}
              disabled={!active}
              onClick={() => void hangUp()}
            >
              Положить трубку
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            color="green"
            leftSection={<PhoneCall size={16} />}
            loading={busy || (!!cardId && callQuery.isPending)}
            disabled={!cardId || !active || !!call || callQuery.isError}
            onClick={() => void start()}
          >
            Позвонить бригаде
          </Button>
        )}
      </div>
    </Group>
  );
}
