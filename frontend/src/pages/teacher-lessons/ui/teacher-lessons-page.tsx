import { Alert, Anchor, Paper, Skeleton, Stack, Table, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { lessonStatusLabels, useLessons } from "@/entities/lesson";
import { Button, TablePagination, usePagination } from "@/shared/ui";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const TeacherLessonsPage = () => {
  const lessons = useLessons();
  const pagination = usePagination(lessons.data ?? []);

  return (
    <Stack gap="md">
      <Title order={2} size="h4" fw={600}>
        Занятия
      </Title>

      {lessons.isPending && (
        <Paper withBorder p="md">
          <Stack gap="xs">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} height={28} radius={2} />
            ))}
          </Stack>
        </Paper>
      )}

      {lessons.isError && (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить занятия">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{lessons.error.message}</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => lessons.refetch()}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {lessons.isSuccess && lessons.data.length === 0 && (
        <Paper withBorder p="md">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              Занятий пока нет
            </Text>
            <Text size="sm" c="povDark2.6">
              Занятие собирается из сценариев и группы. Начните со списка сценариев, затем назначьте
              их группе.
            </Text>
          </Stack>
        </Paper>
      )}

      {lessons.isSuccess && lessons.data.length > 0 && (
        <Paper withBorder>
          <Table verticalSpacing="sm" highlightOnHover layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Название</Table.Th>
                <Table.Th w={220}>Группа</Table.Th>
                <Table.Th w={120}>Сценариев</Table.Th>
                <Table.Th w={120}>Проведено</Table.Th>
                <Table.Th w={130}>Средний балл</Table.Th>
                <Table.Th w={150}>Состояние</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagination.rows.map((lesson) => (
                <Table.Tr key={lesson.lesson_id}>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/teacher/lessons/${lesson.lesson_id}`}
                      size="sm"
                      c="povDark2.6"
                      underline="always"
                    >
                      <Text span size="sm" lineClamp={1}>
                        {lesson.name}
                      </Text>
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={1}>
                      {lesson.group_name}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{lesson.scenarios_count}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{dateFormatter.format(new Date(lesson.started_at))}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {lesson.average_total ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{lessonStatusLabels[lesson.status]}</Text>
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

export default TeacherLessonsPage;
