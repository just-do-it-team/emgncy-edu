import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useSessionStore } from "@/entities/session";
import {
  apiError,
  formatApiDate,
  statusLabels,
  trainingApi,
  trainingKeys,
} from "@/entities/training";
import { DEFAULT_PAGE_SIZE, TablePagination } from "@/shared/ui";

export function ConnectedResults() {
  const userId = useSessionStore((state) => state.profile?.userId);
  if (!userId) return <Navigate to="/login" replace />;
  return (
    <Stack>
      <Title order={2} size="h4">
        Мои результаты
      </Title>
      <Results key={userId} userId={userId} />
    </Stack>
  );
}
function Results({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const query = useQuery({
    queryKey: trainingKeys.historyPage(userId, page, pageSize),
    queryFn: ({ signal }) =>
      trainingApi.history(userId, pageSize, (page - 1) * pageSize, signal),
    refetchInterval: 15000,
    meta: { showGlobalError: false },
  });
  useEffect(() => {
    if (!query.data) return;
    const lastPage = Math.max(1, Math.ceil(query.data.total / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [page, pageSize, query.data]);
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
      <Paper withBorder>
        <Table.ScrollContainer minWidth={950}>
          <Table verticalSpacing="md" highlightOnHover>
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
                ].map((title) => (
                  <Table.Th key={title}>{title}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {query.data?.items.map((item) => (
                <Table.Tr key={item.session_id}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {item.scenario_name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{item.attempt_number}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatApiDate(item.started_at)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {statusLabels[item.status] ?? item.status}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {item.final_score ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {item.final_passed === null
                        ? "Не оценено"
                        : item.final_passed
                          ? "Зачёт"
                          : "Незачёт"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{item.expert_comment ?? "—"}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!!query.data?.total && (
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={query.data.total}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
          />
        )}
      </Paper>
      {query.data?.total === 0 && (
        <Text c="dimmed">История занятий пока пуста.</Text>
      )}
    </Stack>
  );
}
