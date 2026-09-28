import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { useSessionStore } from "@/entities/session";
import { TablePagination, usePagination } from "@/shared/ui";
import {
  apiError,
  assignmentBlocker,
  assignmentLaunchContext,
  clearStartKey,
  formatApiDate,
  notifyTrainingError,
  pendingStartKey,
  startKey,
  statusLabels,
  trainingApi,
  trainingKeys,
  type Assignment,
} from "@/entities/training";
import classes from "./connected-overview.module.scss";

export function ConnectedOverview() {
  const userId = useSessionStore((state) => state.profile?.userId);
  if (!userId) return <Navigate to="/login" replace />;
  return (
    <Stack>
      <Title order={2} size="h4">
        Доступные занятия
      </Title>
      <Assignments key={userId} userId={userId} />
    </Stack>
  );
}
function Assignments({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: trainingKeys.assignments(userId),
    queryFn: ({ signal }) => trainingApi.assignments(userId, signal),
    refetchInterval: 15000,
    meta: { showGlobalError: false },
  });
  const now = Date.now();
  const assignments = [...(query.data ?? [])].sort((left, right) => {
    const leftAvailable =
      !assignmentBlocker(left, left.attempts_used, now) &&
      !assignmentLaunchContext(left, userId);
    const rightAvailable =
      !assignmentBlocker(right, right.attempts_used, now) &&
      !assignmentLaunchContext(right, userId);
    return (
      Number(rightAvailable) - Number(leftAvailable) ||
      Date.parse(right.created_at) - Date.parse(left.created_at) ||
      left.id.localeCompare(right.id)
    );
  });
  const pagination = usePagination(assignments);
  if (query.isPending) return <Loader size="sm" />;
  return (
    <Stack>
      {query.isError && (
        <Alert color="red" title="Не удалось обновить занятия">
          {apiError(query.error)}{" "}
          <Button variant="subtle" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </Alert>
      )}
      <Paper withBorder>
        <Table.ScrollContainer minWidth={1180}>
          <Table verticalSpacing="md" className={classes.assignmentsTable}>
            <colgroup>
              <col />
              <col className={classes.workplaceColumn} />
              <col className={classes.dueColumn} />
              <col className={classes.statusColumn} />
              <col className={classes.actionColumn} />
            </colgroup>
            <Table.Thead>
              <Table.Tr>
                {["Занятие", "Рабочее место", "Срок", "Статус", "Действие"].map(
                  (title) => (
                    <Table.Th key={title}>{title}</Table.Th>
                  ),
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagination.rows.map((assignment) => (
                <AssignmentRow
                  key={assignment.id}
                  userId={userId}
                  assignment={assignment}
                  stale={query.isError}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {pagination.total > 0 && (
          <TablePagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        )}
      </Paper>
      {query.data?.length === 0 && (
        <Text c="dimmed">
          Назначенных занятий пока нет. Они появятся после назначения
          преподавателем.
        </Text>
      )}
    </Stack>
  );
}
function AssignmentRow({
  assignment,
  userId,
  stale,
}: {
  assignment: Assignment;
  userId: string;
  stale: boolean;
}) {
  const { participant, scenario } = assignment;
  const mode = participant.position_code === null ? "ARM112" : "DDS";
  const [busy, setBusy] = useState(false);
  const [pendingStart, setPendingStart] = useState(
    () => !!pendingStartKey(userId, assignment.id),
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const context = assignmentLaunchContext(assignment, userId);
  const blocker = assignmentBlocker(assignment, assignment.attempts_used);
  function openSession(sessionId: string) {
    const params = new URLSearchParams({
      assignment: assignment.id,
      session: sessionId,
    });
    navigate(`/student/arm?${params}`);
  }
  async function start() {
    if (busy) return;
    setBusy(true);
    let leavingOverview = false;
    try {
      const current = await trainingApi.assignment(assignment.id, userId);
      const active = assignmentLaunchContext(current, userId);
      if (useSessionStore.getState().profile?.userId !== userId) return;
      if (active) {
        clearStartKey(userId, assignment.id);
        setPendingStart(false);
        throw new Error("Занятие уже запущено. Повторный запуск недоступен.");
      }
      if (context || current.status === "RUNNING")
        throw new Error("Занятие уже запущено. Повторный запуск недоступен.");
      // Only a previously persisted key may replay an uncertain start.
      if (!pendingStartKey(userId, assignment.id)) {
        const reason = assignmentBlocker(current, current.attempts_used);
        if (reason) throw new Error(reason);
      }
      const request = startKey(userId, assignment.id);
      setPendingStart(true);
      const started = await trainingApi.start(
        userId,
        assignment.id,
        request.key,
      );
      if (useSessionStore.getState().profile?.userId !== userId) return;
      request.clear();
      setPendingStart(false);
      leavingOverview = true;
      if (["CREATED", "RUNNING"].includes(started.status)) {
        openSession(started.session_id);
      } else {
        navigate("/student/results");
      }
    } catch (err) {
      notifyTrainingError(err);
    } finally {
      setBusy(false);
      if (
        !leavingOverview &&
        useSessionStore.getState().profile?.userId === userId
      ) {
        void queryClient.invalidateQueries({
          queryKey: trainingKeys.assignments(userId),
        });
      }
    }
  }
  // A persisted start key also allows recovery when the first POST succeeded but its response was lost.
  return (
    <Table.Tr>
      <Table.Td className={classes.scenarioCell}>
        <Text fw={600}>{scenario.name}</Text>
        <Text size="xs" c="dimmed">
          {scenario.description}
        </Text>
        <Text size="xs">
          Сложность: {scenario.difficulty} ·{" "}
          {Math.ceil(scenario.estimated_duration_seconds / 60)} мин · карточек:{" "}
          {scenario.cards_count}
        </Text>
        <Text size="xs" c="dimmed">
          Попытки: {assignment.attempts_used} / {assignment.max_attempts}
        </Text>
      </Table.Td>
      <Table.Td>
        <Text fw={600}>{mode === "ARM112" ? "Оператор 112" : "ДДС"}</Text>
        <Text size="xs">
          {mode === "DDS"
            ? `Служба: ${participant.position_code}`
            : "Служба 112"}
        </Text>
      </Table.Td>
      <Table.Td className={classes.dueCell}>
        {assignment.due_at ? formatApiDate(assignment.due_at) : "Без срока"}
      </Table.Td>
      <Table.Td className={classes.statusCell}>
        <Badge
          className={classes.statusBadge}
          color={assignment.status === "ASSIGNED" ? "green" : "gray"}
        >
          {statusLabels[assignment.status] ?? assignment.status}
        </Badge>
      </Table.Td>
      <Table.Td className={classes.actionCell}>
        {assignment.status !== "COMPLETED" && (
          <Button
            size="sm"
            loading={busy}
            disabled={stale || !!context || (!pendingStart && !!blocker)}
            onClick={() => void start()}
          >
            Начать обучение
          </Button>
        )}
      </Table.Td>
    </Table.Tr>
  );
}
