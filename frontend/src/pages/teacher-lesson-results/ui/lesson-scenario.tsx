import { useState } from "react";
import { Anchor, Group, Paper, Skeleton, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "react-router-dom";
import { launchPolicyLabels } from "@/entities/assignment";
import { actionTypeLabel } from "@/entities/expert-review";
import {
  completionPolicyLabels,
  scenarioItemLabels,
  scenarioModeLabels,
  useScenario,
  workspaceLabels,
} from "@/entities/scenario";
import { cardsPhrase, type Lesson } from "@/features/teacher-lessons";
import type { ProceduralGeneration, ScenarioDetail, ScenarioItem, ScenarioTrigger } from "@/shared/api";
import { PROCEDURAL_PACE_BY_DIFFICULTY } from "@/shared/config";
import { Button, tooltipEvents } from "@/shared/ui";
import { Fact } from "./fact";
import classes from "./lesson-results.module.scss";

const SECONDS_IN_MINUTE = 60;
const MAX_DIFFICULTY = 5;
const PACE_SCALE =
  "Сложность задаёт темп процедурной подачи: от одной карточки раз в 180 с на уровне 1 до одной раз в 30 с при четырёх одновременно открытых на уровне 5.";

function distinct<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function durationLabel(seconds: number): string {
  return seconds < SECONDS_IN_MINUTE ? `${seconds} с` : `≈ ${Math.round(seconds / SECONDS_IN_MINUTE)} мин`;
}

function difficultyHint(scenario: ScenarioDetail): string {
  const pace = PROCEDURAL_PACE_BY_DIFFICULTY.get(scenario.difficulty);

  if (scenario.mode === "STATIC") {
    return `${PACE_SCALE} В этом сценарии процедурной подачи нет: карточки и звонки подаются по своим условиям, см. «Состав».`;
  }
  if (!pace) return PACE_SCALE;

  return `${PACE_SCALE} На уровне ${scenario.difficulty}: первая карточка через ${pace.initialDelaySeconds} с от начала, далее одна раз в ${pace.releaseIntervalSeconds} с, одновременно открыто не больше ${pace.maxActive}. Шаблоны берутся сложностью не выше ${scenario.difficulty}.`;
}

function triggerLabel(trigger: ScenarioTrigger | null, labelOf: (key: string) => string): string {
  if (trigger === null) return "—";
  if (trigger.type === "TIME_OFFSET") return `через ${trigger.offsetSeconds} с от начала`;

  const delay = trigger.delaySeconds > 0 ? `с задержкой ${trigger.delaySeconds} с` : "без задержки";

  const action = actionTypeLabel(trigger.actionType) ?? `${trigger.actionType} (названия нет)`;

  return `после действия «${action}» по элементу «${labelOf(trigger.itemKey)}», ${delay}`;
}

function poolLabel(generation: ProceduralGeneration, difficulty: number): string {
  const source =
    generation.templateIds !== null
      ? `выбранных шаблонов: ${generation.templateIds.length}`
      : generation.classificationGroupCodes !== null
        ? `шаблонов групп классификатора ${generation.classificationGroupCodes.join(", ")}`
        : "всех активных шаблонов карточек";

  return `${cardsPhrase(generation.targetCount)} из пула ${source}, сложностью не выше ${difficulty}. Какие именно — определяется при старте попытки.`;
}

function ServicesCell({ item }: { item: ScenarioItem }) {
  if (item.notificationList.length === 0) {
    return (
      <Text size="sm" c="povDark2.6">
        не задан
      </Text>
    );
  }

  return <Text size="sm">{item.notificationList.map((service) => service.name ?? service.code).join(", ")}</Text>;
}

function CompositionTable({ items }: { items: ScenarioItem[] }) {
  const labels = scenarioItemLabels(items);
  const labelByKey = new Map(items.map((item, index) => [item.key, labels[index] ?? item.key]));
  const labelOf = (key: string) => labelByKey.get(key) ?? key;

  return (
    <Paper withBorder>
      <Table verticalSpacing="sm" layout="fixed">
        <colgroup>
          <col width={110} />
          <col width={220} />
          <col />
          <col width={170} />
          <col />
        </colgroup>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Элемент</Table.Th>
            <Table.Th>Когда подаётся</Table.Th>
            <Table.Th>Итоговый тип происшествия</Table.Th>
            <Table.Th>Главная служба</Table.Th>
            <Table.Th>Список оповещения</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item, index) => (
            <Table.Tr key={item.key}>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {labels[index]}
                </Text>
                {item.templateName && (
                  <Text size="xs" c="povDark2.6" lineClamp={2}>
                    {item.templateName}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Text size="sm">{triggerLabel(item.trigger, labelOf)}</Text>
              </Table.Td>
              <Table.Td>
                {item.classification ? (
                  <Text size="sm">{item.classification.finalIncidentType}</Text>
                ) : (
                  <Text size="sm" c="povDark2.6">
                    не задан в эталоне
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                {item.mainService ? (
                  <Text size="sm">{item.mainService.name ?? item.mainService.code}</Text>
                ) : (
                  <Text size="sm" c="povDark2.6">
                    не задана
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <ServicesCell item={item} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

function Composition({ scenario, assignedRevisions }: { scenario: ScenarioDetail; assignedRevisions: number[] }) {
  const [opened, setOpened] = useState(false);
  const otherRevisions = assignedRevisions.filter((revision) => revision !== scenario.revision);
  const hasStatic = scenario.mode !== "PROCEDURAL";

  return (
    <Stack gap="xs">
      <Group gap="sm" wrap="wrap">
        <Button
          size="xs"
          variant="outline"
          color="povDark2.6"
          onClick={() => setOpened((value) => !value)}
          aria-expanded={opened}
          rightSection={opened ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        >
          Состав
        </Button>
        {otherRevisions.length > 0 && (
          <Text size="xs" c="povDark2.6">
            Показан текущий состав сценария, ревизия {scenario.revision}; назначена была ревизия{" "}
            {otherRevisions.join(", ")}.
          </Text>
        )}
      </Group>

      {opened && (
        <Stack gap="xs">
          {hasStatic &&
            (scenario.items.length > 0 ? (
              <CompositionTable items={scenario.items} />
            ) : (
              <Text size="sm" c="povDark2.6">
                В сценарии нет карточек и звонков. Состав задаётся в карточке сценария.
              </Text>
            ))}
          {scenario.procedural && (
            <Text size="sm">
              <Text span size="sm" c="povDark2.6">
                Процедурная подача:{" "}
              </Text>
              {poolLabel(scenario.procedural, scenario.difficulty)}
            </Text>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function ScenarioOverview({ scenario, lesson }: { scenario: ScenarioDetail; lesson: Lesson }) {
  const launch = distinct(lesson.assignments.map((assignment) => launchPolicyLabels[assignment.launchPolicy]));
  const attempts = distinct(lesson.assignments.map((assignment) => assignment.maxAttempts));
  const revisions = distinct(lesson.assignments.map((assignment) => assignment.scenarioRevision));

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Stack gap={4}>
          <Anchor
            component={Link}
            to={`/teacher/scenarios/${scenario.id}`}
            size="sm"
            fw={600}
            c="povDark2.6"
            underline="always"
            className={classes.focusable}
          >
            {scenario.name}
          </Anchor>
          {scenario.description && <Text size="sm">{scenario.description}</Text>}
        </Stack>

        <Group gap="xl" align="flex-start" wrap="wrap">
          <Fact label="Сложность">
            <Tooltip
              label={difficultyHint(scenario)}
              events={tooltipEvents}
              multiline
              w={320}
              color="povDark.6"
              radius={0}
            >
              <span tabIndex={0} className={classes.focusable}>
                {scenario.difficulty} из {MAX_DIFFICULTY}
              </span>
            </Tooltip>
          </Fact>
          <Fact label="Длительность">{durationLabel(scenario.estimatedDurationSeconds)}</Fact>
          <Fact label="Карточек">{scenario.cardsCount}</Fact>
          <Fact label="Режим">{scenarioModeLabels[scenario.mode]}</Fact>
          <Fact label="Рабочее место">{workspaceLabels[scenario.workspaceMode]}</Fact>
          <Fact label="Попыток разрешено">{attempts.join(", ")}</Fact>
        </Group>

        <Stack gap={2}>
          <Text size="sm">
            <Text span size="sm" c="povDark2.6">
              Запуск:{" "}
            </Text>
            {launch.join("; ")}
          </Text>
          <Text size="sm">
            <Text span size="sm" c="povDark2.6">
              Завершение:{" "}
            </Text>
            {completionPolicyLabels[scenario.completionPolicy]}
          </Text>
        </Stack>

        <Composition scenario={scenario} assignedRevisions={revisions} />
      </Stack>
    </Paper>
  );
}

export function LessonScenario({ lesson }: { lesson: Lesson }) {
  const scenario = useScenario(lesson.scenarioId);

  return (
    <Stack gap="sm">
      <Title order={3} size="h5" fw={600}>
        Сценарий
      </Title>
      {scenario.isPending && <Skeleton height={150} radius={2} />}
      {scenario.isError && (
        <Paper withBorder p="md">
          <Stack gap="xs" align="flex-start">
            <Text size="sm" fw={600}>
              Не удалось загрузить сценарий «{lesson.scenarioName}»
            </Text>
            <Text size="sm" c="povDark2.6">
              Сценарий удалён, недоступен или сервер не ответил. Остальные данные занятия показаны ниже.
            </Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => scenario.refetch()}>
              Повторить
            </Button>
          </Stack>
        </Paper>
      )}
      {scenario.isSuccess && <ScenarioOverview scenario={scenario.data} lesson={lesson} />}
    </Stack>
  );
}
