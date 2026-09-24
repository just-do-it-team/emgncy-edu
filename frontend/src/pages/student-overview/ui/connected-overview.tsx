import { useState } from "react";
import {
  Alert,
  Anchor,
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
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useSessionStore } from "@/entities/session";
import {
  apiError,
  assignmentBlocker,
  assignmentLaunchContext,
  clearStartKey,
  formatApiDate,
  pendingStartKey,
  startKey,
  statusLabels,
  trainingApi,
  type Assignment,
  type TrainingSession,
} from "@/entities/training";

export function ConnectedOverview() {
  const userId = useSessionStore((state) => state.profile?.userId);
  if (!userId) return <Navigate to="/login" replace />;
  return (
    <Stack>
      <Title order={2} size="h4">
        Доступные занятия
      </Title>
      <Anchor component={Link} to="/student/results">
        Мои результаты
      </Anchor>
      <Assignments key={userId} userId={userId} />
    </Stack>
  );
}
function Assignments({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ["student-api", userId, "assignments"],
    queryFn: async ({ signal }) => {
      const [assignments, sessions] = await Promise.all([
        trainingApi.assignments(userId, signal),
        trainingApi.sessions(userId, signal),
      ]);
      return { assignments, sessions };
    },
    refetchInterval: 15000,
    meta: { showGlobalError: false },
  });
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
        <Table.ScrollContainer minWidth={850}>
          <Table verticalSpacing="md">
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
              {query.data?.assignments.map((assignment) => (
                <AssignmentRow
                  key={assignment.id}
                  userId={userId}
                  assignment={assignment}
                  sessions={query.data.sessions.filter(
                    (s) => s.assignment_id === assignment.id,
                  )}
                  stale={query.isError}
                />
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
      {query.data?.assignments.length === 0 && (
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
  sessions,
  userId,
  stale,
}: {
  assignment: Assignment;
  sessions: TrainingSession[];
  userId: string;
  stale: boolean;
}) {
  const { participant, scenario } = assignment;
  const mode = participant.position_code === null ? "ARM112" : "DDS";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingStart, setPendingStart] = useState(
    () => !!pendingStartKey(userId, assignment.id),
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const context = assignmentLaunchContext(assignment, userId);
  const running = sessions.some((s) =>
    ["CREATED", "RUNNING"].includes(s.status),
  );
  const blocker = assignmentBlocker(assignment, sessions.length);
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
    setError(null);
    try {
      const current = await trainingApi.assignment(assignment.id, userId);
      const active = assignmentLaunchContext(current, userId);
      if (useSessionStore.getState().profile?.userId !== userId) return;
      if (active) {
        clearStartKey(userId, assignment.id);
        setPendingStart(false);
        throw new Error("Занятие уже запущено. Повторный запуск недоступен.");
      }
      if (context || running || current.status === "RUNNING")
        throw new Error("Занятие уже запущено. Повторный запуск недоступен.");
      // Only a previously persisted key may replay an uncertain start.
      if (!pendingStartKey(userId, assignment.id)) {
        const reason = assignmentBlocker(current, sessions.length);
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
      if (["CREATED", "RUNNING"].includes(started.status)) {
        openSession(started.session_id);
      } else {
        navigate("/student/results");
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
      if (useSessionStore.getState().profile?.userId === userId) {
        void queryClient.invalidateQueries({
          queryKey: ["student-api", userId, "assignments"],
        });
      }
    }
  }
  // A persisted start key also allows recovery when the first POST succeeded but its response was lost.
  return (
    <Table.Tr>
      <Table.Td>
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
          Попытки: {sessions.length} / {assignment.max_attempts}
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
      <Table.Td>
        {assignment.due_at ? formatApiDate(assignment.due_at) : "Без срока"}
      </Table.Td>
      <Table.Td>
        <Badge>{statusLabels[assignment.status] ?? assignment.status}</Badge>
      </Table.Td>
      <Table.Td>
        <Button
          size="xs"
          loading={busy}
          disabled={
            stale || !!context || running || (!pendingStart && !!blocker)
          }
          onClick={() => void start()}
        >
          Начать обучение
        </Button>
        {(context || running) && (
          <Text size="xs" maw={260} mt={4}>
            Занятие уже запущено. Повторный запуск недоступен.
          </Text>
        )}
        {!context && !running && !pendingStart && blocker && (
          <Text size="xs" maw={260} mt={4}>
            {blocker}
          </Text>
        )}
        {error && (
          <Text c="red" size="xs" maw={280} mt={4}>
            {error}
          </Text>
        )}
      </Table.Td>
    </Table.Tr>
  );
}
