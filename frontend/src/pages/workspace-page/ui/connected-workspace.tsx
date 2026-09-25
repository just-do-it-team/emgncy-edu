import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { notifications } from "@mantine/notifications";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useSessionStore } from "@/entities/session";
import { WorkspaceHeader } from "@/widgets/workspace-header";
import {
  apiError,
  assignmentLaunchContext,
  isUuid,
  notifyTrainingError,
  trainingApi,
  type CardListItem,
  type LaunchContext,
  type TrainingSession,
} from "@/entities/training";
import { IncidentList } from "./incident-list";
import { listIncident } from "../model/api-card-adapter";
import type { OperatorCardEntry } from "../model/operator-cards";
import { ConnectedCard } from "./connected-card";
import { IncomingCalls } from "./incoming-calls";
import { useWorkspaceEvents } from "./use-workspace-events";
import { useTrainingPresence } from "./use-training-presence";
import classes from "./workspace-page.module.scss";

class PendingSessionError extends Error {}

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
    queryKey: [
      "student-api",
      userId,
      "launch-context",
      assignmentId,
      sessionId,
    ],
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
  const [callBusy, setCallBusy] = useState(false);
  const [callDraft, setCallDraft] = useState<OperatorCardEntry | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [openCardRequest, setOpenCardRequest] = useState(0);
  const [finishAfterBusy, setFinishAfterBusy] = useState(false);
  const backAction = useRef<() => void>(() => {});
  const [needsManualRefresh, setNeedsManualRefresh] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const baseKey = ["student-api", ctx.userId, ctx.workspaceId];
  const readiness = useQuery({
    queryKey: [...baseKey, "readiness", ctx.sessionId],
    queryFn: ({ signal }) => trainingApi.readiness(ctx, signal),
    refetchOnWindowFocus: false,
    meta: { showGlobalError: false },
  });
  const connection = useWorkspaceEvents(ctx, readiness.isSuccess);
  const cards = useInfiniteQuery({
    queryKey: [...baseKey, "cards", "pages"],
    queryFn: ({ pageParam, signal }) =>
      trainingApi.cards(ctx, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor,
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
    queryKey: [...baseKey, "incoming-calls", ctx.sessionId],
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
  const reference = useQuery({
    queryKey: ["student-api", "reference", ctx.mode],
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
        queryKey: ["student-api", ctx.userId, "assignments"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["student-api", ctx.userId, "history"],
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
    readiness.isError || cards.isError || reference.isError;
  const connectionLost =
    connection === "disconnected" ||
    presence === "interrupted" ||
    presence === "unavailable" ||
    requestConnectionLost;
  useEffect(() => {
    if (connectionLost) setNeedsManualRefresh(true);
  }, [connectionLost]);
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
  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: baseKey });
  }
  async function refreshManually() {
    if (manualRefreshing) return;
    setManualRefreshing(true);
    try {
      const results = await Promise.allSettled([
        queryClient.invalidateQueries(
          { queryKey: baseKey },
          { throwOnError: true },
        ),
        queryClient.invalidateQueries(
          { queryKey: ["student-api", "reference", ctx.mode] },
          { throwOnError: true },
        ),
      ]);
      if (
        results.every((result) => result.status === "fulfilled") &&
        connection === "connected" &&
        (!presenceActive || presence === "connected")
      )
        setNeedsManualRefresh(false);
    } finally {
      setManualRefreshing(false);
    }
  }
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
        queryKey: ["student-api", ctx.userId, "history"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["student-api", ctx.userId, "assignments"],
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
      void finish(
        readiness.data?.completion_policy === "STUDENT_CONFIRM"
          ? "complete"
          : "abort",
      );
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
  return (
    <div
      className={classes.page}
      data-operator-editing={
        ctx.mode === "ARM112" && editingCard ? true : undefined
      }
    >
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
      <Group justify="space-between" className={classes.trainingBar}>
        <Group>
          <Button
            size="lg"
            color={
              canComplete || readiness.data?.status === "COMPLETED"
                ? "green"
                : "red"
            }
            variant="filled"
            fw={700}
            disabled={exiting || callBusy || opening}
            loading={exiting}
            onClick={requestFinish}
          >
            Завершить занятие
          </Button>
          <Text fw={600}>{ctx.title}</Text>
        </Group>
        <div id="workspace-call-controls" className={classes.callControlSlot} />
        <Group>
          <Badge>
            {ctx.mode === "DDS"
              ? `ДДС · ${ctx.positionCode ?? "служба не назначена"}`
              : "Оператор 112"}
          </Badge>
          {presenceActive && (
            <Badge
              color={
                connectionLost
                  ? "yellow"
                  : presence === "connected" && connection === "connected"
                    ? "green"
                    : "gray"
              }
              title={
                connection === "disconnected"
                  ? "Связь с событиями прервана. После восстановления соединения обновите данные."
                  : requestConnectionLost
                    ? "Не удалось загрузить данные. После восстановления соединения обновите их вручную."
                    : presence === "unavailable"
                      ? "Сервер пока не принимает подтверждение присутствия. Занятие остаётся открытым; повторяем запрос."
                      : presence === "interrupted"
                        ? "Не удалось подтвердить присутствие. Повторяем запрос каждые 5 секунд."
                        : undefined
              }
              aria-live="polite"
            >
              {connection === "disconnected" || requestConnectionLost
                ? "Связь прервана"
                : presence === "connected" && connection === "connected"
                  ? "Связь активна"
                  : presence === "checking" || connection === "connecting"
                    ? "Проверка связи"
                    : presence === "unavailable"
                      ? "Проверка присутствия недоступна"
                      : "Связь прервана"}
            </Badge>
          )}
          {needsManualRefresh && (
            <Button
              size="lg"
              variant="default"
              fw={700}
              loading={manualRefreshing}
              onClick={() => void refreshManually()}
            >
              Обновить данные
            </Button>
          )}
          {hasWorkspaceQueryError && !needsManualRefresh && (
            <Button
              size="sm"
              variant="subtle"
              disabled={
                readiness.isFetching || cards.isFetching || reference.isFetching
              }
              onClick={() => {
                if (readiness.isError) void readiness.refetch();
                if (reference.isError) void reference.refetch();
                if (cards.isFetchNextPageError) {
                  void cards.fetchNextPage({ cancelRefetch: false });
                } else if (cards.isError) {
                  void cards.refetch();
                }
              }}
            >
              Повторить загрузку
            </Button>
          )}
        </Group>
      </Group>
      {!editingCard && (
        <WorkspaceHeader
          role="student"
          operatorMode={ctx.mode === "ARM112"}
          onCreateCard={
            canCreateCallCard
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
          onCardCreated={setSelectedId}
          openCardRequest={openCardRequest}
        />
      )}
      {!editingCard && (
        <div className={classes.content}>
          <IncidentList
            incidents={[
              ...(callDraft ? [callDraft.incident] : []),
              ...visibleCards.map((c) =>
                listIncident(c, reference.data?.kinds ?? [], ctx.positionCode),
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
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
