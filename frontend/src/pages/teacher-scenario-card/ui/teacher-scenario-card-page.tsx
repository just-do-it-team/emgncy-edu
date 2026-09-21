import { Alert, Group, Paper, Skeleton, Stack, Table, Text, Title } from "@mantine/core";
import { useParams } from "react-router-dom";
import { scenarioModeLabels, scenarioStatusLabels, useScenario } from "@/entities/scenario";
import { isRequestError } from "@/shared/api";
import { Button } from "@/shared/ui";

const TeacherScenarioCardPage = () => {
  const { scenarioId = "" } = useParams();
  const scenario = useScenario(scenarioId);

  if (scenario.isPending) {
    return (
      <Stack gap="md">
        <Skeleton height={96} radius={2} />
        <Skeleton height={200} radius={2} />
      </Stack>
    );
  }

  if (scenario.isError) {
    const notFound = isRequestError(scenario.error) && scenario.error.status === 404;

    return (
      <Alert
        variant="outline"
        color="povDark2.6"
        title={notFound ? "Сценарий не найден" : "Не удалось загрузить сценарий"}
      >
        <Stack gap="xs" align="flex-start">
          <Text size="sm">
            {notFound
              ? "Сценарий удалён или идентификатор в адресе неверный."
              : scenario.error.message}
          </Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={() => scenario.refetch()}>
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  const data = scenario.data;

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Stack gap={4}>
          <Title order={2} size="h4" fw={600}>
            {data.name}
          </Title>
          <Text size="sm">
            {scenarioModeLabels[data.mode]} · сложность {data.difficulty} · вес {data.weight} ·
            норматив обработки {data.fill_norm_seconds} с
          </Text>
          <Text size="xs" c="povDark2.6">
            {scenarioStatusLabels[data.status]} · ревизия {data.revision} · использован в{" "}
            {data.used_in_lessons} занятиях
          </Text>
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack gap={4}>
          <Text size="xs" c="povDark2.6">
            Итоговый тип по ЕКП
          </Text>
          <Text size="sm" fw={600}>
            {data.incident_type_name}
          </Text>
          <Text size="xs" c="povDark2.6">
            Тип ЕКП-35: {data.ekp35_incident_type}
          </Text>
        </Stack>
      </Paper>

      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Признаки
        </Title>
        <Paper withBorder>
          <Table verticalSpacing="sm" layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={110}>Уровень</Table.Th>
                <Table.Th>Вопрос опросной карты</Table.Th>
                <Table.Th>Ответ</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.features.map((feature) => (
                <Table.Tr key={feature.feature_id}>
                  <Table.Td>
                    <Text size="sm">{feature.level}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{feature.group}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {feature.name}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      </Stack>

      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Список оповещения
        </Title>
        <Paper withBorder p="md">
          <Stack gap={8}>
            <Group gap={6}>
              <Text size="xs" c="povDark2.6">
                Главная служба:
              </Text>
              <Text size="sm" fw={600}>
                {data.main_service.name}
              </Text>
            </Group>
            <Text size="sm">
              {data.notification_list.map((service) => service.name).join(" · ")}
            </Text>
            <Text size="xs" c="povDark2.6">
              Пропуск главной службы — критическая ошибка, список выводится из итогового типа по ЕКП
              и вручную не редактируется.
            </Text>
          </Stack>
        </Paper>
      </Stack>
    </Stack>
  );
};

export default TeacherScenarioCardPage;
