import { STUDENT_API_ENABLED } from "@/entities/training";
import { ConnectedOverview } from "./connected-overview";
import {
  Anchor,
  Badge,
  Group,
  Paper,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { Link } from "react-router-dom";
import { studentLessons, trainingModeLabels } from "@/entities/lesson";
import { Button } from "@/shared/ui";

const DemoOverview = () => (
  <Stack gap="md">
    <Group justify="space-between">
      <div>
        <Title order={2} size="h4" fw={600}>
          Доступные занятия
        </Title>
        <Text size="sm" c="dimmed" mt={4}>
          Выберите занятие для отработки в рабочем месте оператора.
        </Text>
      </div>
      <Anchor
        component={Link}
        to="/student/results"
        size="sm"
        c="povDark2.6"
        underline="always"
      >
        Мои результаты
      </Anchor>
    </Group>
    <Paper withBorder>
      <Table.ScrollContainer minWidth={800}>
        <Table verticalSpacing="md" highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Занятие</Table.Th>
              <Table.Th>Рабочее место</Table.Th>
              <Table.Th>Сложность</Table.Th>
              <Table.Th>Длительность</Table.Th>
              <Table.Th>Статус</Table.Th>
              <Table.Th aria-label="Действия" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {studentLessons.map((lesson) => (
              <Table.Tr key={lesson.id}>
                <Table.Td>
                  <Text size="sm" fw={600}>
                    {lesson.name}
                  </Text>
                  <Text size="xs" c="dimmed" mt={4} maw={430}>
                    {lesson.description}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge
                    variant="light"
                    color={lesson.mode === "ARM112" ? "povBlue" : "povDark2"}
                  >
                    {trainingModeLabels[lesson.mode]}
                  </Badge>
                </Table.Td>
                <Table.Td>{lesson.difficulty}</Table.Td>
                <Table.Td>{lesson.duration} мин</Table.Td>
                <Table.Td>
                  <Text size="sm" c="povBlue.6">
                    Доступно
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Button
                    component={Link}
                    to={`/student/arm?lesson=${lesson.id}`}
                    size="xs"
                  >
                    Начать обучение
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
    <Text size="xs" c="dimmed">
      Учебный режим · демонстрационные занятия. Голосовой диалог будет доступен
      позже.
    </Text>
  </Stack>
);

const StudentOverviewPage = () =>
  STUDENT_API_ENABLED ? <ConnectedOverview /> : <DemoOverview />;
export default StudentOverviewPage;
