import { Anchor, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { Button } from "@/shared/ui";

const StudentOverviewPage = () => {
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap={4}>
          <Title order={2} size="h4" fw={600}>
            Назначенных занятий нет
          </Title>
          <Text size="sm" c="povDark2.6">
            Рабочее место доступно для самостоятельной отработки. Разбор завершённых попыток — в
            разделе «Мои результаты».
          </Text>
        </Stack>

        <Group gap="md" wrap="nowrap">
          <Anchor component={Link} to="/student/results" size="sm" c="povDark2.6" underline="always">
            К моим результатам
          </Anchor>
          <Button
            component={Link}
            to="/student/arm"
            size="xs"
            variant="outline"
            color="povDark2.6"
          >
            Войти в АРМ
          </Button>
        </Group>
      </Group>
    </Paper>
  );
};

export default StudentOverviewPage;
