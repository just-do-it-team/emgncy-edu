import { useState } from "react";
import { Alert, Group, Paper, SegmentedControl, Skeleton, Stack, Table, Text, Title } from "@mantine/core";
import { isAxiosError } from "axios";
import { useParams } from "react-router-dom";
import { classifierRecords } from "@/entities/incident";
import {
  scenarioItemLabels,
  scenarioStatusLabels,
  useScenario,
  workspaceModeLabels,
} from "@/entities/scenario";
import { isRequestError, type ScenarioDetail, type ScenarioItem } from "@/shared/api";
import { CARD_FILL_NORM_SECONDS } from "@/shared/config";
import { Button } from "@/shared/ui";

const FEATURE_LEVELS = [1, 2, 3] as const;

function errorStatus(error: Error): number | undefined {
  if (isRequestError(error)) return error.status;

  return isAxiosError(error) ? error.response?.status : undefined;
}

function IncidentTypeBlock({ item }: { item: ScenarioItem }) {
  return (
    <Paper withBorder p="md">
      <Stack gap={4}>
        <Text size="xs" c="povDark2.6">
          Итоговый тип по ЕКП
        </Text>
        {item.classification ? (
          <Text size="sm" fw={600}>
            {item.classification.finalIncidentType}
          </Text>
        ) : (
          <Text size="sm" c="povDark2.6">
            В эталоне элемента классификация не задана.
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

function FeaturesBlock({ item }: { item: ScenarioItem }) {
  const classification = item.classification;
  const record = classification
    ? classifierRecords.find((candidate) => candidate.id === classification.recordId)
    : undefined;

  return (
    <Stack gap="sm">
      <Title order={3} size="h5" fw={600}>
        Признаки
      </Title>
      {classification === null ? (
        <Paper withBorder p="md">
          <Text size="sm" c="povDark2.6">
            Признаков нет: в эталоне элемента не задана классификация.
          </Text>
        </Paper>
      ) : record === undefined ? (
        <Paper withBorder p="md">
          <Text size="sm" c="povDark2.6">
            Запись классификатора {classification.recordId} не найдена в справочнике тренажёра, названия
            признаков показать нельзя. Коды признаков: {classification.featureCodes.join(" / ")}.
          </Text>
        </Paper>
      ) : (
        <Paper withBorder>
          <Table verticalSpacing="sm" layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={110}>Уровень</Table.Th>
                <Table.Th>Группа</Table.Th>
                <Table.Th>Признак</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {FEATURE_LEVELS.map((level, index) => (
                <Table.Tr key={level}>
                  <Table.Td>
                    <Text size="sm">{level}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{record.group}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {record.features[index] ?? "не используется"}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

function ServicesBlock({ item }: { item: ScenarioItem }) {
  return (
    <Stack gap="sm">
      <Title order={3} size="h5" fw={600}>
        Список оповещения
      </Title>
      <Paper withBorder p="md">
        {item.mainService === null ? (
          <Text size="sm" c="povDark2.6">
            В эталоне элемента службы не заданы.
          </Text>
        ) : (
          <Stack gap={8}>
            <Group gap={6}>
              <Text size="xs" c="povDark2.6">
                Главная служба:
              </Text>
              <Text size="sm" fw={600}>
                {item.mainService.name ?? item.mainService.code}
              </Text>
            </Group>
            <Text size="sm">
              {item.notificationList.map((service) => service.name ?? service.code).join(" · ")}
            </Text>
            <Text size="xs" c="povDark2.6">
              Пропуск главной службы — критическая ошибка, список выводится из итогового типа по ЕКП
              и вручную не редактируется.
            </Text>
          </Stack>
        )}
      </Paper>
    </Stack>
  );
}

function ScenarioCard({ data }: { data: ScenarioDetail }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const labels = scenarioItemLabels(data.items);
  const selected = data.items.find((item) => item.key === selectedKey) ?? data.items[0];

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Stack gap={4}>
          <Title order={2} size="h4" fw={600}>
            {data.name}
          </Title>
          <Text size="sm">
            Режим: {workspaceModeLabels[data.workspaceMode]} · сложность {data.difficulty} · норматив
            обработки {CARD_FILL_NORM_SECONDS} с
          </Text>
          <Text size="xs" c="povDark2.6">
            {scenarioStatusLabels[data.status]} · ревизия {data.revision}
          </Text>
        </Stack>
      </Paper>

      {data.items.length > 1 && (
        <SegmentedControl
          size="xs"
          radius={2}
          value={selected?.key ?? ""}
          onChange={setSelectedKey}
          data={data.items.map((item, index) => ({ value: item.key, label: labels[index] }))}
          aria-label="Элемент сценария"
          style={{ alignSelf: "flex-start" }}
        />
      )}

      {selected ? (
        <>
          <IncidentTypeBlock item={selected} />
          <FeaturesBlock item={selected} />
          <ServicesBlock item={selected} />
        </>
      ) : (
        <Paper withBorder p="md">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              В сценарии нет карточек и звонков
            </Text>
            <Text size="sm" c="povDark2.6">
              Итоговый тип и список оповещения появятся, когда в сценарий добавят хотя бы один элемент.
            </Text>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

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
    const status = errorStatus(scenario.error);
    const notFound = status === 404 || status === 422;

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
              : "Сервер не ответил. Повторите запрос позже."}
          </Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={() => scenario.refetch()}>
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  return <ScenarioCard data={scenario.data} />;
};

export default TeacherScenarioCardPage;
