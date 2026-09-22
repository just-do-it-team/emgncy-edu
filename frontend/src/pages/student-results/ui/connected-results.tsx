import { useState } from "react";
import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { StudentConnection } from "@/features/student-connection";
import {
  apiError,
  formatApiDate,
  isUuid,
  statusLabels,
  trainingApi,
  useTrainingIdentity,
} from "@/entities/training";

export function ConnectedResults() {
  const userId = useTrainingIdentity((s) => s.userId);
  return (
    <Stack>
      <Title order={2} size="h4">
        Мои результаты
      </Title>
      <Anchor component={Link} to="/student">
        К занятиям
      </Anchor>
      {!isUuid(userId) ? (
        <StudentConnection />
      ) : (
        <Results key={userId} userId={userId} />
      )}
    </Stack>
  );
}
function Results({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["student-api", userId, "history", page],
    queryFn: ({ signal }) =>
      trainingApi.history(userId, (page - 1) * 20, signal),
    refetchInterval: 15000,
    meta: { showGlobalError: false },
  });
  if (query.isPending) return <Loader size="sm" />;
  return (
    <Stack>
      {query.isError && (
        <Alert color="red">
          {apiError(query.error)}{" "}
          <Button variant="subtle" onClick={() => void query.refetch()}>
            Повторить
          </Button>
        </Alert>
      )}
      <Table.ScrollContainer minWidth={750}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              {[
                "Занятие",
                "Попытка",
                "Начало",
                "Статус",
                "Оценка",
                "Результат",
                "Комментарий",
              ].map((s) => (
                <Table.Th key={s}>{s}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {query.data?.items.map((item) => (
              <Table.Tr key={item.session_id}>
                <Table.Td>{item.scenario_name}</Table.Td>
                <Table.Td>{item.attempt_number}</Table.Td>
                <Table.Td>{formatApiDate(item.started_at)}</Table.Td>
                <Table.Td>{statusLabels[item.status] ?? item.status}</Table.Td>
                <Table.Td>{item.final_score ?? "—"}</Table.Td>
                <Table.Td>
                  {item.final_passed === null
                    ? "Не оценено"
                    : item.final_passed
                      ? "Зачёт"
                      : "Незачёт"}
                </Table.Td>
                <Table.Td>{item.expert_comment ?? "—"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {query.data?.total === 0 && (
        <Text c="dimmed">История занятий пока пуста.</Text>
      )}
      <Group justify="end">
        <Button
          variant="default"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Назад
        </Button>
        <Text>Страница {page}</Text>
        <Button
          variant="default"
          disabled={!query.data || page * 20 >= query.data.total}
          onClick={() => setPage(page + 1)}
        >
          Далее
        </Button>
      </Group>
    </Stack>
  );
}
