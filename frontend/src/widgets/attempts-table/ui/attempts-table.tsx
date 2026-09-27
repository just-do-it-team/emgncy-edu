import { Alert, Anchor, Group, Paper, Skeleton, Stack, Table, Text } from "@mantine/core";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { attemptModeLabels, type AttemptSummary } from "@/entities/attempt";
import { formatShortDateTime } from "@/shared/lib";
import { Button, TablePagination, usePagination } from "@/shared/ui";

function ErrorCounts({ counts }: { counts: AttemptSummary["error_counts"] }) {
  const total = counts.critical + counts.significant + counts.minor;

  if (total === 0) return <Text size="sm">нет</Text>;

  return (
    <Group gap={10} wrap="nowrap">
      <Text size="sm" fw={counts.critical > 0 ? 600 : 400}>
        крит. {counts.critical}
      </Text>
      <Text size="sm">знач. {counts.significant}</Text>
      <Text size="sm" c="povDark2.6">
        незнач. {counts.minor}
      </Text>
    </Group>
  );
}

interface AttemptsTableProps {
  query: UseQueryResult<AttemptSummary[], Error>;
  filter?: (attempt: AttemptSummary) => boolean;
  reviewPath: (attemptId: string) => string;
  emptyTitle: string;
  emptyHint: string;
}

export function AttemptsTable({
  query,
  filter,
  reviewPath,
  emptyTitle,
  emptyHint,
}: AttemptsTableProps) {
  const visible = (query.data ?? []).filter((attempt) => filter?.(attempt) ?? true);
  const pagination = usePagination(visible);

  if (query.isPending) {
    return (
      <Paper withBorder p="md">
        <Stack gap="xs">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} height={28} radius={2} />
          ))}
        </Stack>
      </Paper>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить попытки">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">{query.error.message}</Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={() => query.refetch()}>
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  if (visible.length === 0) {
    return (
      <Paper withBorder p="md">
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            {emptyTitle}
          </Text>
          <Text size="sm" c="povDark2.6">
            {emptyHint}
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper withBorder>
      <Table verticalSpacing="sm" highlightOnHover layout="fixed">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Обучаемый</Table.Th>
            <Table.Th w={120}>АРМ</Table.Th>
            <Table.Th>Занятие</Table.Th>
            <Table.Th w={120}>Завершена</Table.Th>
            <Table.Th w={110}>Обработка</Table.Th>
            <Table.Th w={80}>Балл</Table.Th>
            <Table.Th w={110}>Результат</Table.Th>
            <Table.Th w={220}>Ошибки</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {pagination.rows.map((attempt) => (
            <Table.Tr key={attempt.attempt_id}>
              <Table.Td>
                <Anchor
                  component={Link}
                  to={reviewPath(attempt.attempt_id)}
                  size="sm"
                  c="povDark2.6"
                  underline="always"
                >
                  <Text span size="sm" lineClamp={1}>
                    {attempt.student.full_name}
                  </Text>
                </Anchor>
              </Table.Td>
              <Table.Td>
                <Text size="sm">
                  {attempt.student.workstation_number} · {attemptModeLabels[attempt.mode]}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" lineClamp={1}>
                  {attempt.scenario.name}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{formatShortDateTime(attempt.completed_at)}</Text>
              </Table.Td>
              <Table.Td>
                <Text
                  size="sm"
                  fw={
                    attempt.timings.fill.actual_seconds > attempt.timings.fill.norm_seconds
                      ? 600
                      : 400
                  }
                >
                  {attempt.timings.fill.actual_seconds} / {attempt.timings.fill.norm_seconds} с
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" fw={600}>
                  {attempt.total}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{attempt.passed ? "Зачёт" : "Не зачтено"}</Text>
              </Table.Td>
              <Table.Td>
                <ErrorCounts counts={attempt.error_counts} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <TablePagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={pagination.onPageChange}
        onPageSizeChange={pagination.onPageSizeChange}
      />
    </Paper>
  );
}
