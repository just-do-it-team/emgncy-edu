import { Alert, Anchor, Paper, Skeleton, Stack, Table, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { useGroups } from "@/entities/group";
import { useSessionStore } from "@/entities/session";
import { Button, TablePagination, usePagination } from "@/shared/ui";

function GroupsList({ teacherId }: { teacherId: string }) {
  const groups = useGroups(teacherId);
  const pagination = usePagination(groups.data ?? []);

  return (
    <Stack gap="md">
      <Title order={2} size="h4" fw={600}>
        Группы
      </Title>

      {groups.isPending && (
        <Paper withBorder p="md">
          <Stack gap="xs">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} height={28} radius={2} />
            ))}
          </Stack>
        </Paper>
      )}

      {groups.isError && (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить группы">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => groups.refetch()}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {groups.isSuccess && groups.data.length === 0 && (
        <Paper withBorder p="md">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Активных групп нет
            </Text>
            <Text size="sm" c="povDark2.6">
              Группы создаются на бэкенде вместе с составом. Обучаемых без группы можно найти в разделе{" "}
              <Anchor component={Link} to="/teacher/students" size="sm" c="povDark2.6" underline="always">
                «Обучаемые»
              </Anchor>
              .
            </Text>
          </Stack>
        </Paper>
      )}

      {groups.isSuccess && groups.data.length > 0 && (
        <Paper withBorder>
          <Table verticalSpacing="sm" layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={240}>Название</Table.Th>
                <Table.Th>Описание</Table.Th>
                <Table.Th w={130}>Обучаемых</Table.Th>
                <Table.Th>Состав</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagination.rows.map((group) => (
                <Table.Tr key={group.id}>
                  <Table.Td>
                    <Text size="sm" fw={600} lineClamp={2}>
                      {group.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={group.description ? undefined : "povDark2.6"} lineClamp={2}>
                      {group.description ?? "Без описания"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{group.students.length}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={group.students.length > 0 ? undefined : "povDark2.6"} lineClamp={3}>
                      {group.students.length > 0
                        ? group.students.map((student) => student.displayName).join(", ")
                        : "В группе пока никого нет"}
                    </Text>
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
}

const TeacherGroupsPage = () => {
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  return <GroupsList teacherId={teacherId} />;
};

export default TeacherGroupsPage;
