import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { StudentConnection } from "@/features/student-connection";
import { WorkspaceHeader } from "@/widgets/workspace-header";
import {
  apiError,
  isUuid,
  loadLaunchContext,
  statusLabels,
  trainingApi,
  useTrainingIdentity,
  type LaunchContext,
} from "@/entities/training";
import { IncidentList } from "./incident-list";
import { listIncident } from "../model/api-card-adapter";
import { ConnectedCard } from "./connected-card";
import classes from "./workspace-page.module.scss";

export function ConnectedWorkspace() {
  const [params] = useSearchParams();
  const userId = useTrainingIdentity((s) => s.userId);
  const sessionId = params.get("session") ?? "";
  const ctx = loadLaunchContext(userId, sessionId);
  if (!isUuid(userId))
    return (
      <Stack p="md">
        <StudentConnection />
        <Button component={Link} to="/student">
          К занятиям
        </Button>
      </Stack>
    );
  if (!ctx)
    return (
      <Alert m="md" title="Сначала откройте назначенное занятие">
        Для API необходимы идентификаторы сессии и рабочего места, полученные
        при запуске.{" "}
        <Button component={Link} to="/student" variant="subtle">
          К занятиям
        </Button>
      </Alert>
    );
  return <LiveWorkspace key={`${userId}:${sessionId}`} ctx={ctx} />;
}
function LiveWorkspace({ ctx }: { ctx: LaunchContext }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const baseKey = ["student-api", ctx.userId, ctx.workspaceId];
  const readiness = useQuery({
    queryKey: [...baseKey, "readiness", ctx.sessionId],
    queryFn: ({ signal }) => trainingApi.readiness(ctx, signal),
    refetchInterval: 5000,
    meta: { showGlobalError: false },
  });
  const cards = useQuery({
    queryKey: [...baseKey, "cards"],
    queryFn: ({ signal }) => trainingApi.cards(ctx, signal),
    refetchInterval: 5000,
    meta: { showGlobalError: false },
  });
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
    if (completing || !readiness.data?.can_complete || !active) return;
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
  return (
    <div className={classes.page}>
      <Group justify="space-between" className={classes.trainingBar}>
        <Group>
          <Button component={Link} to="/student" variant="subtle">
            К занятиям
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
        {ctx.mode === "ARM112" && (
          <Text size="sm" c="dimmed">
            Карточки поступают из сценария. Бэкенд пока разрешает создание новых
            карточек только преподавателю; обучающийся может дополнять
            существующие.
          </Text>
        )}
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
                {readiness.data.cards_pending}
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
              <Button
                size="xs"
                variant="default"
                loading={cards.isFetching}
                onClick={() => void refresh()}
              >
                Обновить
              </Button>
              {readiness.data.completion_policy === "STUDENT_CONFIRM" && (
                <Button
                  size="xs"
                  loading={completing}
                  disabled={
                    !active || !readiness.data.can_complete || !!selectedId
                  }
                  onClick={() => void complete()}
                >
                  Завершить занятие
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
                title={`Не удалось обновить ${label}`}
              >
                {apiError(q.error)}{" "}
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => void q.refetch()}
                >
                  Повторить
                </Button>
              </Alert>
            ),
        )}
        {actionError && <Alert color="red">{actionError}</Alert>}
        {cards.data?.length === 0 && (
          <Text c="dimmed">
            Доступных карточек пока нет. Список обновляется каждые 5 секунд по
            мере поступления карточек сценария.
          </Text>
        )}
        {cards.data?.length === 500 && (
          <Alert color="yellow">
            Показаны последние 500 карточек — предел текущего API.
          </Alert>
        )}
      </Stack>
      <div className={classes.content}>
        <IncidentList
          incidents={(cards.data ?? []).map((c) =>
            listIncident(c, reference.data?.kinds ?? [], ctx.positionCode),
          )}
          operatorMode={ctx.mode === "ARM112"}
          onOpenIncident={(incident) => {
            if (incident.serverId) void open(incident.serverId);
          }}
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
