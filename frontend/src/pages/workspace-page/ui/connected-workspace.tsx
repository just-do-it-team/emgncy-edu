import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { notifications } from "@mantine/notifications";
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Modal,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  useQueries,
} from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, CircleHelp, Lightbulb } from "lucide-react";
import { useSessionStore } from "@/entities/session";
import { ArmMemo } from "@/widgets/arm-memo";
import { WorkspaceHeader } from "@/widgets/workspace-header";
import {
  apiError,
  assignmentLaunchContext,
  isUuid,
  notifyTrainingError,
  trainingApi,
  trainingKeys,
  type CardListItem,
  type ApiCard,
  type LaunchContext,
  type TrainingSession,
} from "@/entities/training";
import { IncidentList } from "./incident-list";
import { listIncident } from "../model/api-card-adapter";
import type { OperatorCardEntry } from "../model/operator-cards";
import { ConnectedCard, type CardSyncState } from "./connected-card";
import { IncomingCalls } from "./incoming-calls";
import { OutgoingCalls } from "./outgoing-calls";
import { useWorkspaceEvents } from "./use-workspace-events";
import { useTrainingPresence } from "./use-training-presence";
import { ArmOnboarding } from "./arm-onboarding";
import { TrainingHints } from "./training-hints";
import classes from "./workspace-page.module.scss";

class PendingSessionError extends Error {}

const headerTooltipProps = {
  multiline: true,
  w: 280,
  withArrow: true,
  position: "bottom" as const,
  color: "povDark.6",
  radius: "sm" as const,
};

const finishedSessionKey = (userId: string, sessionId: string) =>
  `finished-training-session:${userId}:${sessionId}`;

function wasFinishedHere(userId: string, sessionId: string) {
  try {
    return (
      sessionStorage.getItem(finishedSessionKey(userId, sessionId)) === "1"
    );
  } catch {
    return false;
  }
}

function rememberFinished(userId: string, sessionId: string) {
  try {
    sessionStorage.setItem(finishedSessionKey(userId, sessionId), "1");
  } catch {
    // A successful server response still permits navigation when storage is unavailable.
  }
}

export function ConnectedWorkspace() {
  const [params] = useSearchParams();
  const userId = useSessionStore((state) => state.profile?.userId);
  const sessionId = params.get("session") ?? "";
  const assignmentId = params.get("assignment") ?? "";
  if (!userId) return <Navigate to="/login" replace />;
  if (wasFinishedHere(userId, sessionId))
    return <Navigate to="/student" replace />;
  if (!isUuid(sessionId) || (assignmentId && !isUuid(assignmentId)))
    return (
      <Alert m="md" title="Сначала откройте назначенное занятие">
        Выберите занятие в списке, чтобы открыть рабочее место.{" "}
        <Button component={Link} to="/student" variant="subtle">
          К занятиям
        </Button>
      </Alert>
    );
  return (
    <RestoredWorkspace
      key={`${userId}:${assignmentId}:${sessionId}`}
      userId={userId}
      assignmentId={assignmentId}
      sessionId={sessionId}
    />
  );
}
function RestoredWorkspace({
  userId,
  assignmentId,
  sessionId,
}: {
  userId: string;
  assignmentId: string;
  sessionId: string;
}) {
  const context = useQuery({
    queryKey: trainingKeys.launchContext(userId, assignmentId, sessionId),
    queryFn: async ({ signal }) => {
      const resolvedAssignmentId =
        assignmentId ||
        (await trainingApi.session({ userId, sessionId }, signal))
          .assignment_id;
      const assignment = await trainingApi.assignment(
        resolvedAssignmentId,
        userId,
        signal,
      );
      const ctx = assignment
        ? assignmentLaunchContext(assignment, userId)
        : null;
      if (!ctx || ctx.sessionId !== sessionId) {
        throw new PendingSessionError(
          "Активная попытка пока не найдена. Она могла завершиться, либо данные после запуска ещё обновляются.",
        );
      }
      return ctx;
    },
    // Retry replica lag after start; restoring a URL must never create an attempt.
    // Resolve once per visit; readiness handles changes during the session.
    staleTime: Infinity,
    gcTime: 0,
    retry: (failureCount, error) =>
      error instanceof PendingSessionError && failureCount < 3,
    retryDelay: 1500,
    meta: { showGlobalError: false },
  });
  if (context.isPending || context.isFetching) {
    return (
      <Stack p="md">
        <Loader size="sm" />
        <Text>Восстанавливаем учебную попытку…</Text>
      </Stack>
    );
  }
  if (context.isError) {
    return (
      <Alert m="md" title="Не удалось открыть попытку" color="yellow">
        {apiError(context.error)}
        <Group mt="sm">
          <Button variant="default" onClick={() => void context.refetch()}>
            Повторить
          </Button>
          <Button component={Link} to="/student" variant="subtle">
            К занятиям
          </Button>
          <Button component={Link} to="/student/results" variant="subtle">
            Результаты
          </Button>
        </Group>
      </Alert>
    );
  }
  return <LiveWorkspace ctx={context.data} />;
}
function LiveWorkspace({ ctx }: { ctx: LaunchContext }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [callDraft, setCallDraft] = useState<OperatorCardEntry | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [openCardRequest, setOpenCardRequest] = useState(0);
  const [finishAfterBusy, setFinishAfterBusy] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [hintsEnabled, setHintsEnabled] = useState(ctx.difficulty <= 2);
  const onboardingButtonRef = useRef<HTMLButtonElement>(null);
  const backAction = useRef<() => void>(() => {});
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cardSyncState, setCardSyncState] = useState<CardSyncState | null>(
    null,
  );
  const readiness = useQuery({
    queryKey: trainingKeys.readiness(ctx),
    queryFn: ({ signal }) => trainingApi.readiness(ctx, signal),
    refetchInterval: (query) =>
      query.state.data?.status === "RUNNING" &&
      (ctx.mode === "DDS" ||
        query.state.data.completion_policy === "AUTO_WHEN_READY")
        ? 5000
        : false,
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  const connection = useWorkspaceEvents(ctx, !!readiness.data);
  const cards = useInfiniteQuery({
    queryKey: trainingKeys.cardPages(ctx),
    queryFn: ({ pageParam, signal }) =>
      trainingApi.cards(ctx, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
    refetchInterval:
      ctx.mode === "DDS" && connection !== "connected" ? 5000 : false,
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  const cardItems = useMemo(() => {
    const byId = new Map<string, CardListItem>();
    for (const page of cards.data?.pages ?? []) {
      for (const card of page.items) {
        const existing = byId.get(card.card_id);
        if (!existing || card.version > existing.version) {
          byId.set(card.card_id, card);
        }
      }
    }
    return [...byId.values()];
  }, [cards.data]);
  const calls = useQuery({
    queryKey: trainingKeys.incomingCalls(ctx),
    queryFn: ({ signal }) => trainingApi.incomingCalls(ctx, signal),
    enabled: ctx.mode === "ARM112",
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  const visibleCards = useMemo(() => {
    if (ctx.mode !== "ARM112") return cardItems;
    const completedCardIds = new Set(
      calls.data
        ?.filter((call) => call.status === "COMPLETED")
        .map((call) => call.incident_card_id)
        .filter((id): id is string => !!id) ?? [],
    );
    return cardItems.filter((card) => completedCardIds.has(card.card_id));
  }, [cardItems, calls.data, ctx.mode]);
  const cardsNeedingDetails =
    ctx.mode === "DDS" ? visibleCards.filter((card) => !card.description) : [];
  const ddsCardDetails = useQueries({
    queries: cardsNeedingDetails.map((card) => ({
      queryKey: trainingKeys.card(ctx, card.card_id),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        trainingApi.card(ctx, card.card_id, signal),
      refetchOnWindowFocus: false,
      meta: { showGlobalError: false },
    })),
  });
  const detailsById = new Map<string, ApiCard>();
  cardsNeedingDetails.forEach((card, index) => {
    const details = ddsCardDetails[index]?.data;
    if (details) detailsById.set(card.card_id, details);
  });
  const selectedCardItem = visibleCards.find(
    (card) => card.card_id === selectedId,
  );
  const tabIncident =
    selectedCardItem?.card_number ?? (cardOpen ? callDraft?.incident.id : undefined) ?? null;

  useEffect(() => {
    document.title = tabIncident === null ? "АРМ-112 — Тренажёр Системы-112" : `Происшествие ${tabIncident} — АРМ-112`;
  }, [tabIncident]);

  const selectedSummary =
    ctx.mode === "DDS" && selectedCardItem
      ? listIncident(
          selectedCardItem,
          [],
          ctx.positionCode,
          detailsById.get(selectedCardItem.card_id),
        )
      : undefined;
  const reference = useQuery({
    queryKey: trainingKeys.referenceMode(ctx.mode),
    queryFn: async ({ signal }) => {
      const services = await trainingApi.services(signal);
      const types =
        ctx.mode === "ARM112" ? [] : await trainingApi.eventTypes(signal);
      const kinds =
        ctx.mode === "ARM112"
          ? []
          : (
              await Promise.all(
                types.map((t) => trainingApi.eventKinds(t.id, signal)),
              )
            ).flat();
      return { types, services, kinds };
    },
    staleTime: 300000,
    meta: { showGlobalError: false },
  });
  const active = readiness.data?.status === "RUNNING" && !readiness.isError;
  const presenceActive =
    !exiting &&
    (!readiness.data ||
      readiness.data.status === "RUNNING" ||
      readiness.data.status === "CREATED");
  const leaveUnavailableSession = useCallback(
    (terminal: boolean) => {
      setExiting(true);
      if (terminal) rememberFinished(ctx.userId, ctx.sessionId);
      void queryClient.invalidateQueries({
        queryKey: trainingKeys.assignments(ctx.userId),
      });
      void queryClient.invalidateQueries({
        queryKey: trainingKeys.history(ctx.userId),
      });
      navigate("/student", { replace: true });
    },
    [ctx.sessionId, ctx.userId, navigate, queryClient],
  );
  const presence = useTrainingPresence(
    ctx,
    presenceActive,
    leaveUnavailableSession,
  );
  const requestConnectionLost = [readiness, cards, calls, reference].some(
    (query) =>
      query.isError && axios.isAxiosError(query.error) && !query.error.response,
  );
  const hasWorkspaceQueryError =
    readiness.isError || cards.isError || calls.isError || reference.isError;
  const connectionLost =
    connection === "disconnected" ||
    presence === "interrupted" ||
    presence === "unavailable" ||
    requestConnectionLost;
  const connectionActive =
    presenceActive &&
    !connectionLost &&
    presence === "connected" &&
    connection === "connected";
  useEffect(() => {
    if (connectionLost || hasWorkspaceQueryError) setNeedsRefresh(true);
  }, [connectionLost, hasWorkspaceQueryError]);
  useEffect(() => {
    if (!needsRefresh || !presenceActive) return;

    let cancelled = false;
    let inFlight = false;
    const refreshAfterReconnect = async () => {
      if (inFlight) return;
      inFlight = true;
      setRefreshing(true);
      try {
        const results = await Promise.allSettled([
          queryClient.invalidateQueries(
            { queryKey: trainingKeys.workspace(ctx) },
            { throwOnError: true },
          ),
          queryClient.invalidateQueries(
            { queryKey: trainingKeys.referenceMode(ctx.mode) },
            { throwOnError: true },
          ),
        ]);
        if (
          !cancelled &&
          connection === "connected" &&
          presence === "connected" &&
          results.every((result) => result.status === "fulfilled")
        )
          setNeedsRefresh(false);
      } finally {
        inFlight = false;
        if (!cancelled) setRefreshing(false);
      }
    };
    void refreshAfterReconnect();
    const interval = window.setInterval(
      () => void refreshAfterReconnect(),
      5000,
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [connection, ctx, needsRefresh, presence, presenceActive, queryClient]);
  useEffect(() => {
    if (
      connection === "connected" &&
      (presence === "interrupted" || presence === "unavailable")
    ) {
      notifyTrainingError(
        new Error(
          "Не удалось подтвердить присутствие в занятии. Проверяем соединение повторно.",
        ),
      );
    }
  }, [connection, presence]);
  const editingCard = cardOpen || !!selectedId;
  const canCreateCallCard =
    ctx.mode === "ARM112" &&
    active &&
    !!reference.data &&
    !!calls.data?.some(
      (call) =>
        (call.status === "ACTIVE" || call.status === "COMPLETED") &&
        !call.incident_card_id,
    );
  const canComplete = active && readiness.data?.can_complete === true;
  const alreadyFinished = ["COMPLETED", "ABORTED"].includes(
    readiness.data?.status ?? "",
  );
  const activeCardSyncState =
    cardSyncState?.cardId === selectedId ? cardSyncState : null;
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: trainingKeys.workspace(ctx),
    });
  }, [ctx, queryClient]);
  async function open(id: string) {
    if (opening) return;
    setOpening(true);
    try {
      if (ctx.mode === "DDS" && ctx.positionCode && active)
        await trainingApi.open(ctx, id);
      setSelectedId(id);
      await refresh();
    } catch (error) {
      notifyTrainingError(error);
    } finally {
      setOpening(false);
    }
  }
  async function finish(action: "complete" | "abort" | "finished") {
    if (exiting) return;
    setExiting(true);
    setFinishOpen(false);
    try {
      let session: TrainingSession;
      try {
        session =
          action === "complete"
            ? await trainingApi.complete(ctx)
            : action === "abort"
              ? await trainingApi.abort(ctx)
              : await trainingApi.session(ctx);
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 409)
          throw error;
        const current = await trainingApi.session(ctx);
        if (!["COMPLETED", "ABORTED"].includes(current.status)) throw error;
        session = current;
      }
      if (!["COMPLETED", "ABORTED"].includes(session.status))
        throw new Error("Сервер не подтвердил завершение занятия.");
      const score = session.score === null ? "" : ` · Оценка: ${session.score}`;
      notifications.show({
        color: session.passed ? "green" : "orange",
        message: `Занятие ${session.passed ? "сдано" : "не сдано"}${score}`,
      });
      void queryClient.invalidateQueries({
        queryKey: trainingKeys.history(ctx.userId),
      });
      void queryClient.invalidateQueries({
        queryKey: trainingKeys.assignments(ctx.userId),
      });
      rememberFinished(ctx.userId, ctx.sessionId);
      navigate("/student", { replace: true });
    } catch (error) {
      notifyTrainingError(error);
      setExiting(false);
      void refresh();
    }
  }
  function requestFinish() {
    if (exiting) return;
    if (callBusy || opening) {
      setFinishAfterBusy(true);
      return;
    }
    if (alreadyFinished) {
      void finish("finished");
    } else if (canComplete) {
      if (readiness.data?.completion_policy === "STUDENT_CONFIRM") {
        void finish("complete");
      } else {
        void readiness.refetch();
      }
    } else {
      setFinishOpen(true);
    }
  }
  backAction.current = requestFinish;
  useEffect(() => {
    if (finishAfterBusy && !callBusy && !opening && !exiting) {
      setFinishAfterBusy(false);
      backAction.current();
    }
  }, [finishAfterBusy, callBusy, opening, exiting]);
  useEffect(() => {
    // Keep one same-URL entry so a browser Back goes through the finish flow.
    const url = window.location.href;
    const guard = () =>
      window.history.pushState(
        { ...window.history.state, trainingGuard: ctx.sessionId },
        "",
        url,
      );
    guard();
    const onBack = () => {
      guard();
      backAction.current();
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, [ctx.sessionId]);
  useEffect(() => {
    if (canComplete) setFinishOpen(false);
  }, [canComplete]);
  const closeOnboarding = useCallback(() => {
    setOnboardingOpen(false);
    onboardingButtonRef.current?.focus();
  }, []);
  const roleTooltip =
    ctx.mode === "DDS"
      ? "Ваша роль в занятии — диспетчер ДДС. Вы принимаете карточки, связываетесь с бригадой и обновляете статус реагирования."
      : "Ваша роль в занятии — оператор 112. Вы принимаете звонки и оформляете карточки происшествий.";
  const connectionTooltip =
    connection === "disconnected"
      ? "Связь с событиями прервана. После восстановления данные обновятся автоматически."
      : requestConnectionLost
        ? "Не удалось загрузить данные. Повторяем загрузку автоматически."
        : presence === "unavailable"
          ? "Сервер пока не принимает подтверждение присутствия. Занятие остаётся открытым; повторяем запрос."
          : presence === "interrupted"
            ? "Не удалось подтвердить присутствие. Повторяем запрос каждые 5 секунд."
            : connectionActive
              ? "Связь с учебным занятием активна. Новые звонки и карточки поступают в АРМ."
              : "Проверяем связь с учебным занятием.";
  const hintsTooltip =
    "Режим подсказок показывает следующий шаг в обучении: что нужно сделать и куда нажать. Доступен для сценариев сложности «Простой» и «Средний»." +
    (ctx.difficulty > 2 ? " В этом сценарии режим недоступен." : "");
  return (
    <div className={classes.page} data-card-open={editingCard || undefined}>
      <Modal
        opened={finishOpen}
        onClose={() => setFinishOpen(false)}
        title="Завершить занятие?"
        centered
        zIndex={1000}
        closeOnClickOutside={!exiting}
        closeOnEscape={!exiting}
      >
        <Stack gap="md">
          <Text>
            Данное действие завершит прохождение обучения. Занятие будет
            провалено.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={exiting}
              onClick={() => setFinishOpen(false)}
            >
              Отмена
            </Button>
            <Button
              color="red"
              loading={exiting}
              onClick={() => void finish("abort")}
            >
              Завершить
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Group
        justify="space-between"
        className={`${classes.trainingBar} ${classes.liveTrainingBar}`}
      >
        <Group className={classes.trainingLeft}>
          <Button
            data-tour="finish-training"
            size="lg"
            color={
              canComplete || readiness.data?.status === "COMPLETED"
                ? "green"
                : "red"
            }
            variant="filled"
            fw={700}
            disabled={
              exiting ||
              callBusy ||
              opening ||
              (canComplete &&
                readiness.data?.completion_policy === "AUTO_WHEN_READY")
            }
            loading={exiting}
            onClick={requestFinish}
          >
            {canComplete &&
            readiness.data?.completion_policy === "AUTO_WHEN_READY"
              ? "Завершаем занятие…"
              : "Завершить занятие"}
          </Button>
          <Text fw={600} className={classes.trainingTitle}>
            {ctx.title}
          </Text>
        </Group>
        <div
          id="workspace-call-controls"
          className={classes.callControlSlot}
          data-tour="call-controls"
        >
          {ctx.mode === "DDS" && (
            <OutgoingCalls
              ctx={ctx}
              cardId={selectedId}
              active={active && !exiting}
              onChanged={refresh}
              onBusyChange={setCallBusy}
            />
          )}
        </div>
        <Group className={classes.trainingRight}>
          <Group gap="xs" className={classes.trainingStatus}>
            <Tooltip {...headerTooltipProps} label={roleTooltip}>
              <Badge>
                {ctx.mode === "DDS"
                  ? `ДДС · ${ctx.positionCode ?? "служба не назначена"}`
                  : "Оператор 112"}
              </Badge>
            </Tooltip>
            <Tooltip {...headerTooltipProps} label={connectionTooltip}>
              <Badge
                data-tour="connection-status"
                variant={connectionActive ? undefined : "filled"}
                color={connectionActive ? "green" : "red"}
                aria-live="polite"
              >
                {connectionActive ? "Связь активна" : "Связь не активна"}
              </Badge>
            </Tooltip>
            {(refreshing ||
              activeCardSyncState?.busy ||
              (presenceActive && !connectionActive)) && (
              <Loader
                size="sm"
                aria-label={
                  connectionActive
                    ? "Обновление данных"
                    : "Восстанавливаем связь"
                }
              />
            )}
          </Group>
          <Group gap="sm" className={classes.trainingHelp}>
            <Tooltip {...headerTooltipProps} label={hintsTooltip}>
              <span
                className={classes.hintsToggle}
                data-disabled={ctx.difficulty > 2 || undefined}
              >
                <span className={classes.hintsIcon} aria-hidden="true">
                  <Lightbulb size={19} strokeWidth={2.4} fill="#ffe7a0" />
                </span>
                <Switch
                  size="sm"
                  aria-label="Режим подсказок"
                  checked={hintsEnabled}
                  disabled={ctx.difficulty > 2}
                  onChange={(event) =>
                    setHintsEnabled(event.currentTarget.checked)
                  }
                />
              </span>
            </Tooltip>
            <Tooltip
              {...headerTooltipProps}
              label="Открывает обзор интерфейса АРМ и объясняет назначение его основных элементов."
            >
              <Button
                ref={onboardingButtonRef}
                className={classes.onboardingButton}
                variant="subtle"
                color="povBlue"
                size="compact-md"
                aria-label="Открыть обучение по АРМ"
                aria-expanded={onboardingOpen}
                aria-controls="arm-onboarding-dialog"
                onClick={() => setOnboardingOpen(true)}
              >
                <CircleHelp size={22} />
              </Button>
            </Tooltip>
            <Tooltip {...headerTooltipProps} label="Справка: памятка «Работа на АРМ-112». Открывается поверх рабочего места, попытка продолжается.">
              <Button
                className={classes.onboardingButton}
                variant="subtle"
                color="povBlue"
                size="compact-md"
                aria-label="Открыть справку по АРМ-112"
                onClick={() => setMemoOpen(true)}
              >
                <BookOpen size={22} />
              </Button>
            </Tooltip>
            <Drawer
              opened={memoOpen}
              onClose={() => setMemoOpen(false)}
              position="right"
              size="xl"
              title="Справка: работа на АРМ-112"
              transitionProps={{ duration: 0 }}
            >
              <ArmMemo />
            </Drawer>
          </Group>
        </Group>
        {ctx.mode !== "DDS" && activeCardSyncState?.message && (
          <Text
            className={classes.trainingCardNotice}
            size="sm"
            fw={600}
            c="red"
            aria-live="polite"
          >
            {activeCardSyncState.message}
          </Text>
        )}
      </Group>
      {!editingCard && (
        <WorkspaceHeader
          role="student"
          operatorMode={ctx.mode === "ARM112"}
          ddsMode={ctx.mode === "DDS"}
          onCreateCard={
            canCreateCallCard && !editingCard
              ? () => setOpenCardRequest((value) => value + 1)
              : undefined
          }
        />
      )}
      {ctx.mode === "ARM112" && (
        <IncomingCalls
          ctx={ctx}
          active={active && !exiting}
          reference={reference.data}
          canCreate={!!reference.data && !reference.isError}
          onChanged={refresh}
          onBusyChange={setCallBusy}
          onDraftChange={setCallDraft}
          onCardOpenChange={setCardOpen}
          onCardCreated={() => setSelectedId(null)}
          openCardRequest={openCardRequest}
        />
      )}
      {!editingCard && (
        <div className={classes.content}>
          <IncidentList
            incidents={[
              ...(callDraft ? [callDraft.incident] : []),
              ...visibleCards.map((c) =>
                listIncident(
                  c,
                  reference.data?.kinds ?? [],
                  ctx.positionCode,
                  detailsById.get(c.card_id),
                ),
              ),
            ]}
            operatorMode={ctx.mode === "ARM112"}
            onOpenIncident={(incident) => {
              if (callDraft && incident.id === callDraft.incident.id)
                setOpenCardRequest((value) => value + 1);
              else if (incident.serverId) void open(incident.serverId);
            }}
            pagination={
              <Group justify="flex-end" className={classes.pagination}>
                <Text size="sm" aria-live="polite">
                  Загружено карточек:{" "}
                  {visibleCards.length + (callDraft ? 1 : 0)}
                </Text>
                {cards.hasNextPage ? (
                  <Button
                    size="xs"
                    variant="default"
                    loading={cards.isFetchingNextPage}
                    disabled={cards.isFetching}
                    onClick={() => {
                      if (!cards.isFetching) {
                        void cards.fetchNextPage({ cancelRefetch: false });
                      }
                    }}
                  >
                    Загрузить ещё
                  </Button>
                ) : cards.isSuccess ? (
                  <Text size="sm">Все карточки загружены</Text>
                ) : null}
              </Group>
            }
          />
        </div>
      )}
      {selectedId && reference.data && (
        <ConnectedCard
          key={selectedId}
          ctx={ctx}
          cardId={selectedId}
          kinds={reference.data.kinds}
          directory={reference.data.services}
          readOnly={!active || exiting || reference.isError}
          summary={selectedSummary}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
          onSyncStateChange={setCardSyncState}
        />
      )}
      {onboardingOpen && (
        <ArmOnboarding
          mode={ctx.mode}
          surface={editingCard ? "card" : "list"}
          onClose={closeOnboarding}
        />
      )}
      <TrainingHints
        ctx={ctx}
        enabled={hintsEnabled && ctx.difficulty <= 2}
        active={active && !exiting && !onboardingOpen && !finishOpen}
        calls={calls.data ?? []}
        cards={visibleCards}
        selectedId={selectedId}
        cardOpen={cardOpen || (ctx.mode === "ARM112" && !!selectedId)}
        draft={callDraft}
        directory={reference.data?.services ?? []}
      />
    </div>
  );
}
