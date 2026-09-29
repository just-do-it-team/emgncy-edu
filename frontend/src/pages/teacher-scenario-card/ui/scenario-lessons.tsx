import {
  Alert,
  Anchor,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { Link } from "react-router-dom";
import {
  AssignedCell,
  lessonStatusLabels,
  lessonStatusTones,
  useTeacherLessons,
  WindowCell,
} from "@/features/teacher-lessons";
import { Button, LinkRow, StatusPill } from "@/shared/ui";
import classes from "./scenario-card.module.scss";

interface ScenarioLessonsProps {
  scenarioId: string;
  teacherId: string;
}

export function ScenarioLessons({
  scenarioId,
  teacherId,
}: ScenarioLessonsProps) {
  const lessons = useTeacherLessons(teacherId);
  const own =
    lessons.status === "success"
      ? lessons.lessons.filter((lesson) => lesson.scenarioId === scenarioId)
      : [];

  return (
    <Stack gap="sm">
      <Title order={3} size="h5" fw={600}>
        Используется в занятиях
      </Title>

      {lessons.status === "pending" && <Skeleton height={80} radius={2} />}

      {lessons.status === "error" && (
        <Alert
          variant="outline"
          color="povDark2.6"
          title="Не удалось загрузить ваши занятия"
        >
          <Stack gap="xs" align="flex-start">
            <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
            <Button
              size="xs"
              variant="outline"
              color="povDark2.6"
              onClick={lessons.retry}
            >
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {lessons.status === "success" && own.length === 0 && (
        <Paper withBorder p="md">
          <Text size="sm" c="povDark2.6">
            В ваших занятиях сценарий не используется. Занятия других
            преподавателей здесь не показаны.
          </Text>
        </Paper>
      )}

      {own.length > 0 && (
        <Paper withBorder>
          <Table verticalSpacing="sm" highlightOnHover layout="fixed">
            <colgroup>
              <col />
              <col width={130} />
              <col width={120} />
              <col width={120} />
              <col width={150} />
            </colgroup>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Группа</Table.Th>
                <Table.Th>Назначено</Table.Th>
                <Table.Th colSpan={2}>Выполнить</Table.Th>
                <Table.Th>Состояние</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {own.map((lesson) => (
                <LinkRow key={lesson.id}>
                  <Table.Td>
                    <Anchor
                      component={Link}
                      to={`/teacher/lessons/${lesson.id}`}
                      size="sm"
                      c="povDark2.6"
                      underline="never"
                      data-row-link
                      className={classes.truncatedLink}
                    >
                      {lesson.groupName ?? "Без группы"}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <AssignedCell value={lesson.assignedAt} />
                  </Table.Td>
                  <Table.Td>
                    <WindowCell prefix="с" value={lesson.availableFrom} />
                  </Table.Td>
                  <Table.Td>
                    <WindowCell prefix="до" value={lesson.dueAt} />
                  </Table.Td>
                  <Table.Td>
                    <StatusPill tone={lessonStatusTones[lesson.status]}>{lessonStatusLabels[lesson.status]}</StatusPill>
                  </Table.Td>
                </LinkRow>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
