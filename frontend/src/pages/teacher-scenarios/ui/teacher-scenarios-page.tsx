import { Alert, Anchor, Paper, Skeleton, Stack, Table, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { scenarioStatusLabels, useScenarios } from "@/entities/scenario";
import { CARD_FILL_NORM_SECONDS } from "@/shared/config";
import { Button, TablePagination, usePagination } from "@/shared/ui";

const TeacherScenariosPage = () => {
  const scenarios = useScenarios();
  const pagination = usePagination(scenarios.data ?? []);

  return (
    <Stack gap="md">
      <Title order={2} size="h4" fw={600}>
        Сценарии
      </Title>

      {scenarios.isPending && (
        <Paper withBorder p="md">
          <Stack gap="xs">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} height={28} radius={2} />
            ))}
          </Stack>
        </Paper>
      )}

      {scenarios.isError && (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить сценарии">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
            <Button
              size="xs"
              variant="outline"
              color="povDark2.6"
              onClick={() => scenarios.refetch()}
            >
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {scenarios.isSuccess && scenarios.data.length === 0 && (
        <Paper withBorder p="md">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Сценариев пока нет
            </Text>
            <Text size="sm" c="povDark2.6">
              Сценарий строится из дерева ЕКП: признаки задают итоговый тип, а он — главную службу и
              список оповещения.
            </Text>
          </Stack>
        </Paper>
      )}

      {scenarios.isSuccess && scenarios.data.length > 0 && (
        <Paper withBorder>
          <Table verticalSpacing="sm" highlightOnHover layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Название</Table.Th>
                <Table.Th w={110}>Сложность</Table.Th>
                <Table.Th w={110}>Норматив</Table.Th>
                <Table.Th w={150}>Состояние</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagination.rows.map((scenario) => (
                <Table.Tr key={scenario.id}>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/teacher/scenarios/${scenario.id}`}
                      size="sm"
                      c="povDark2.6"
                      underline="always"
                    >
                      <Text span size="sm" lineClamp={1}>
                        {scenario.name}
                      </Text>
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{scenario.difficulty}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{CARD_FILL_NORM_SECONDS} с</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{scenarioStatusLabels[scenario.status]}</Text>
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
      )}
    </Stack>
  );
};

export default TeacherScenariosPage;
