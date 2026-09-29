import { Anchor, List, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { LEADERS_MIN_ATTEMPTS } from "../model/analytics-rules";
import { leadersAndLaggards, type RankedStudent, type StudentStats } from "../model/student-stats";

const score = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function RankedList({ title, students, empty }: { title: string; students: RankedStudent[]; empty: string }) {
  return (
    <Stack gap="xs">
      <Title order={4} size="h6" fw={600}>
        {title}
      </Title>
      {students.length === 0 ? (
        <Text size="sm" c="povDark2.6">
          {empty}
        </Text>
      ) : (
        <List size="sm" spacing={6}>
          {students.map(({ stats, text }) => (
            <List.Item key={stats.studentId}>
              <Anchor component={Link} to={`/teacher/students?student=${stats.studentId}`} size="sm" c="povDark2.6" underline="always">
                {stats.name}
              </Anchor>
              <Text span size="sm">
                {" "}
                — {score.format(stats.average ?? 0)}; {text}
              </Text>
            </List.Item>
          ))}
        </List>
      )}
    </Stack>
  );
}

export function Leaders({ stats }: { stats: StudentStats[] }) {
  const { leaders, laggards } = leadersAndLaggards(stats);
  const empty = `Нужны обучаемые хотя бы с ${LEADERS_MIN_ATTEMPTS} оценёнными попытками.`;

  return (
    <Paper withBorder p="md">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <RankedList title="Лидеры — и почему" students={leaders} empty={empty} />
        <RankedList
          title="Отстающие — и почему"
          students={laggards}
          empty={leaders.length > 0 ? "Для сравнения нужен ещё хотя бы один обучаемый с достаточной историей." : empty}
        />
      </SimpleGrid>
    </Paper>
  );
}
