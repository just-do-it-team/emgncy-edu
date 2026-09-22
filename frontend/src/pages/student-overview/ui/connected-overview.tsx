import { useState } from "react";
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { StudentConnection } from "@/features/student-connection";
import {
  apiError,
  assignmentBlocker,
  formatApiDate,
  isUuid,
  loadLaunchContext,
  saveLaunchContext,
  startKey,
  statusLabels,
  trainingApi,
  useTrainingIdentity,
  type ArmMode,
  type Assignment,
  type TrainingSession,
} from "@/entities/training";

export function ConnectedOverview() {
  const userId = useTrainingIdentity((state) => state.userId);
  return (
    <Stack>
      <Title order={2} size="h4">
        Доступные занятия
      </Title>
      <StudentConnection />
      <Anchor component={Link} to="/student/results">
        Мои результаты
      </Anchor>
      {isUuid(userId) && <Assignments key={userId} userId={userId} />}
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
      <Text size="xs" c="dimmed">
        В API пока нет отдельного поля «Оператор 112 / ДДС». Выберите нужный
        интерфейс; доступ к карточкам и службе определяется назначением
        преподавателя.
      </Text>
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
  const participant = assignment.participants.find((p) => p.user_id === userId);
  const [mode, setMode] = useState<ArmMode>(
    participant?.position_code ? "DDS" : "ARM112",
  );
  const scenario = useQuery({
    queryKey: ["student-api", userId, "scenario", assignment.scenario_id],
    queryFn: ({ signal }) =>
      trainingApi.scenario(assignment.scenario_id, userId, signal),
    staleTime: 60000,
    meta: { showGlobalError: false },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const running = sessions.find((s) => s.status === "RUNNING");
  const context = running ? loadLaunchContext(userId, running.id) : null;
  const blocker = assignmentBlocker(assignment, sessions.length);
  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (context) {
        saveLaunchContext({ ...context, mode });
        navigate(`/student/arm?session=${context.sessionId}`);
        return;
      }
      const request = startKey(userId, assignment.id);
      const started = await trainingApi.start(
        userId,
        assignment.id,
        request.key,
      );
      saveLaunchContext({
        userId,
        sessionId: started.session_id,
        workspaceId: started.workspace_id,
        assignmentId: assignment.id,
        mode,
        positionCode: participant?.position_code ?? null,
        title: scenario.data?.name ?? "Учебное занятие",
      });
      request.clear();
      void queryClient.invalidateQueries({
        queryKey: ["student-api", userId, "assignments"],
      });
      navigate(`/student/arm?session=${started.session_id}`);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }
  // A persisted start key also allows recovery when the first POST succeeded but its response was lost.
  return (
    <Table.Tr>
      <Table.Td>
        <Text fw={600}>{scenario.data?.name ?? "Учебное занятие"}</Text>
        <Text size="xs" c="dimmed">
          {scenario.data?.description}
        </Text>
        {scenario.data && (
          <Text size="xs">
            Сложность: {scenario.data.difficulty} ·{" "}
            {Math.ceil(scenario.data.estimated_duration_seconds / 60)} мин ·
            карточек: {scenario.data.cards_count}
          </Text>
        )}
        {scenario.isError && (
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => void scenario.refetch()}
          >
            Повторить загрузку названия
          </Button>
        )}
        <Text size="xs" c="dimmed">
          Попытки: {sessions.length} / {assignment.max_attempts}
        </Text>
      </Table.Td>
      <Table.Td>
        <Select
          aria-label="Рабочее место"
          w={175}
          allowDeselect={false}
          value={mode}
          onChange={(v) => setMode(v as ArmMode)}
          data={[
            { value: "ARM112", label: "Оператор 112" },
            { value: "DDS", label: "ДДС" },
          ]}
        />
        <Text size="xs">
          Служба: {participant?.position_code ?? "не назначена"}
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
          disabled={stale || (!context && !running && !!blocker)}
          onClick={() => void start()}
        >
          {context
            ? "Продолжить"
            : running
              ? "Восстановить сессию"
              : "Начать обучение"}
        </Button>
        {!context && blocker && (
          <Text size="xs" maw={260} mt={4}>
            {running
              ? "Если сессия запущена в другом браузере, API может не вернуть рабочее место. Вернитесь в браузер, где запускалось занятие."
              : blocker}
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
