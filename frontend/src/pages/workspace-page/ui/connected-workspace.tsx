import { useMemo, useState } from "react";
import axios from "axios";
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
  statusLabels,
  trainingApi,
  type CardListItem,
  type LaunchContext,
} from "@/entities/training";
import { IncidentList } from "./incident-list";
import { listIncident } from "../model/api-card-adapter";
import { ConnectedCard } from "./connected-card";
import { IncomingCalls } from "./incoming-calls";
import { useWorkspaceEvents } from "./use-workspace-events";
import classes from "./workspace-page.module.scss";

class PendingSessionError extends Error {}

export function ConnectedWorkspace() {
  const [params] = useSearchParams();
  const userId = useSessionStore((state) => state.profile?.userId);
  const sessionId = params.get("session") ?? "";
  const assignmentId = params.get("assignment") ?? "";
  if (!userId) return <Navigate to="/login" replace />;
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
      const assignment = assignmentId
        ? await trainingApi.assignment(assignmentId, userId, signal)
        : (await trainingApi.assignments(userId, signal)).find(
            (item) => item.active_session?.session_id === sessionId,
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
  const [completing, setCompleting] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
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
  const reference = useQuery({
    queryKey: ["student-api", "reference"],
    queryFn: async ({ signal }) => {
      const [types, services] = await Promise.all([
        trainingApi.eventTypes(signal),
        trainingApi.services(signal),
      ]);
      const kinds = (
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
  const requiresAbort =
    !readiness.data || ["CREATED", "RUNNING"].includes(readiness.data.status);
  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: baseKey });
  }
  async function open(id: string) {
    if (opening) return;
    setOpening(true);
    setActionError(null);
    try {
      if (ctx.mode === "DDS" && ctx.positionCode && active)
        await trainingApi.open(ctx, id);
      setSelectedId(id);
      await refresh();
    } catch (error) {
      setActionError(apiError(error));
    } finally {
      setOpening(false);
    }
  }
  async function complete() {
    if (completing || callBusy || !readiness.data?.can_complete || !active)
      return;
    setCompleting(true);
    setActionError(null);
    try {
      await trainingApi.complete(ctx);
      await refresh();
      await queryClient.invalidateQueries({
        queryKey: ["student-api", ctx.userId, "history"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["student-api", ctx.userId, "assignments"],
      });
    } catch (error) {
      setActionError(apiError(error));
    } finally {
      setCompleting(false);
    }
  }
  async function finish() {
    if (exiting) return;
    if (requiresAbort) {
      setExiting(true);
      setActionError(null);
      try {
        await trainingApi.abort(ctx);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["student-api", ctx.userId, "history"],
          }),
          queryClient.invalidateQueries({
            queryKey: ["student-api", ctx.userId, "assignments"],
          }),
        ]);
      } catch (error) {
        setActionError(
          axios.isAxiosError(error) && error.response?.status === 404
            ? "Не удалось завершить попытку: метод недоступен или попытка не найдена. Занятие остаётся активным."
            : apiError(error),
        );
        setExiting(false);
        setFinishOpen(false);
        return;
      }
    }
    navigate("/student");
  }
  return (
    <div className={classes.page}>
      <Modal
        opened={finishOpen}
        onClose={() => setFinishOpen(false)}
        title="Завершить занятие?"
        centered
        closeOnClickOutside={!exiting}
        closeOnEscape={!exiting}
      >
        <Stack gap="md">
          <Text>
            {requiresAbort
              ? "Попытка будет завершена и засчитана как несданная."
              : "Вы вернётесь к списку занятий."}
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              disabled={exiting}
              onClick={() => setFinishOpen(false)}
            >
              Отмена
            </Button>
            <Button color="red" loading={exiting} onClick={() => void finish()}>
              Завершить
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Group justify="space-between" className={classes.trainingBar}>
        <Group>
          <Button
            size="lg"
            color="red"
            fw={700}
            onClick={() => setFinishOpen(true)}
          >
            Завершить занятие
          </Button>
          <Text fw={600}>{ctx.title}</Text>
        </Group>
        <Group>
          <Badge>
            {ctx.mode === "DDS"
              ? `ДДС · ${ctx.positionCode ?? "служба не назначена"}`
              : "Оператор 112"}
          </Badge>
          <Badge variant="outline">API</Badge>
        </Group>
      </Group>
      <WorkspaceHeader role="student" operatorMode={ctx.mode === "ARM112"} />
      <Stack px="md" py="sm" gap="xs">
        {ctx.mode === "DDS" && !ctx.positionCode && (
          <Alert color="yellow">
            В назначении не указана служба ДДС. Доступен просмотр карточек; для
            решений нужна назначенная преподавателем служба.
          </Alert>
        )}
        {readiness.data && (
          <Group justify="space-between">
            <div>
              <Text size="sm">
                Занятие:{" "}
                {statusLabels[readiness.data.status] ?? readiness.data.status} ·
                Решений: {readiness.data.decisions_completed} /{" "}
                {readiness.data.decisions_required} · Карточек ожидается:{" "}
                {readiness.data.cards_pending} · Звонков завершено:{" "}
                {readiness.data.calls_completed} / {readiness.data.calls_total}
              </Text>
              {active &&
                readiness.data.blockers.map((b, i) => (
                  <Text key={`${b.code}:${i}`} size="xs" c="dimmed">
                    {b.message}
                  </Text>
                ))}
              {active &&
                readiness.data.completion_policy === "AUTO_WHEN_READY" && (
                  <Text size="xs">
                    Занятие завершится автоматически после выполнения условий.
                  </Text>
                )}
              {active &&
                readiness.data.completion_policy === "TEACHER_ONLY" && (
                  <Text size="xs">Занятие завершает преподаватель.</Text>
                )}
            </div>
            <Group>
              {readiness.data.completion_policy === "STUDENT_CONFIRM" && (
                <Button
                  size="xs"
                  loading={completing}
                  disabled={
                    !active ||
                    !readiness.data.can_complete ||
                    !!selectedId ||
                    callBusy
                  }
                  onClick={() => void complete()}
                >
                  Сдать занятие
                </Button>
              )}
              {!active && readiness.data.status === "COMPLETED" && (
                <Button component={Link} to="/student/results" size="xs">
                  Результаты
                </Button>
              )}
            </Group>
          </Group>
        )}
        <Group justify="center">
          <Button
            size="md"
            variant="default"
            loading={readiness.isFetching || cards.isFetching}
            onClick={() => void refresh()}
          >
            Обновить данные
          </Button>
        </Group>
        {connection === "disconnected" && (
          <Alert color="yellow">
            Связь с событиями прервана. Нажмите «Обновить данные», чтобы
            загрузить актуальное состояние.
          </Alert>
        )}
        {(cards.isPending || reference.isPending || opening) && (
          <Loader size="sm" />
        )}
        {[
          { q: cards, label: "карточки" },
          { q: reference, label: "справочники" },
          { q: readiness, label: "состояние занятия" },
        ].map(
          ({ q, label }) =>
            q.isError && (
              <Alert
                key={label}
                color="red"
                title={
                  q === cards && cards.isFetchNextPageError
                    ? "Не удалось загрузить следующие карточки"
                    : `Не удалось обновить ${label}`
                }
              >
                {apiError(q.error)}{" "}
                <Button
                  variant="subtle"
                  size="xs"
                  disabled={q.isFetching}
                  onClick={() => {
                    if (q === cards && cards.isFetchNextPageError) {
                      void cards.fetchNextPage({ cancelRefetch: false });
                    } else {
                      void q.refetch({ cancelRefetch: false });
                    }
                  }}
                >
                  Повторить
                </Button>
              </Alert>
            ),
        )}
        {actionError && <Alert color="red">{actionError}</Alert>}
        {ctx.mode === "ARM112" && (
          <IncomingCalls
            ctx={ctx}
            active={active && !completing}
            cards={cardItems}
            reference={reference.data}
            canCreate={!!reference.data && !reference.isError}
            onChanged={refresh}
            onOpenCard={(id) => void open(id)}
            onBusyChange={setCallBusy}
          />
        )}
        {cards.isSuccess && cardItems.length === 0 && (
          <Text c="dimmed">
            Доступных карточек пока нет. Новые карточки появятся при поступлении
            событий сценария.
          </Text>
        )}
      </Stack>
      <div className={classes.content}>
        <IncidentList
          incidents={cardItems.map((c) =>
            listIncident(c, reference.data?.kinds ?? [], ctx.positionCode),
          )}
          operatorMode={ctx.mode === "ARM112"}
          onOpenIncident={(incident) => {
            if (incident.serverId) void open(incident.serverId);
          }}
          pagination={
            <Group justify="flex-end" className={classes.pagination}>
              <Text size="sm" aria-live="polite">
                Загружено карточек: {cardItems.length}
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
      {selectedId && reference.data && (
        <ConnectedCard
          key={selectedId}
          ctx={ctx}
          cardId={selectedId}
          kinds={reference.data.kinds}
          directory={reference.data.services}
          readOnly={!active || completing || reference.isError}
          onClose={() => setSelectedId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
