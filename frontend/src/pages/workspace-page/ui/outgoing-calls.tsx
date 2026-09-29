import { useCallback, useEffect, useState } from "react";
import { Button, Group, Text } from "@mantine/core";
import { Clock3, PhoneCall, PhoneOff } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiError,
  notifyTrainingError,
  trainingApi,
  trainingKeys,
  type LaunchContext,
  type OutgoingCall,
} from "@/entities/training";
import { useIncomingCallAudio } from "./use-incoming-call-audio";
import { useCallRingtone } from "./use-call-ringtone";
import outgoingRingtone from "@/assets/audio/phone-ringing-sound.mp3";
import { ReplyWaiting } from "./reply-waiting";
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
  const queryKey = trainingKeys.outgoingCall(ctx, cardId);
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
  const [dialing, setDialing] = useState(false);
  const [greetingStartedCallId, setGreetingStartedCallId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [, setClockTick] = useState(0);
  const {
    start: startRingtone,
    stop: stopRingtone,
    blocked: ringtoneBlocked,
  } = useCallRingtone(outgoingRingtone);
  const onGreetingStart = useCallback(
    (callId: string) => {
      stopRingtone();
      setGreetingStartedCallId(callId);
    },
    [stopRingtone],
  );

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
    onGreetingStart,
  );
  const waitingForGreeting =
    talking && !busy && greetingStartedCallId !== call?.id && !audio.error;
  useEffect(() => {
    if (active && (dialing || waitingForGreeting)) startRingtone();
    else stopRingtone();
  }, [active, dialing, waitingForGreeting, startRingtone, stopRingtone]);

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
    setDialing(true);
    startRingtone();
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
      setDialing(false);
      setBusy(false);
    }
  }

  async function hangUp() {
    if (!call || !talking || busy) return;
    stopRingtone();
    setBusy(true);
    setError(null);
    try {
      const completed = await trainingApi.completeOutgoingCall(ctx, call.id);
      setOngoingCall(null);
      queryClient.setQueryData(
        trainingKeys.outgoingCall(ctx, completed.incident_card_id),
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
          {talking && audio.awaitingReply ? <ReplyWaiting /> : status}
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
        {ringtoneBlocked && active && (dialing || waitingForGreeting) && (
          <Button
            size="compact-xs"
            variant="subtle"
            className={classes.callRetry}
            onClick={startRingtone}
          >
            Включить звук вызова
          </Button>
        )}
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
            data-guidance="call-brigade"
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
