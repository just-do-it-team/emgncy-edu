import { useState } from "react";
import { Paper, SegmentedControl, Skeleton, Stack, Table, Text, Title } from "@mantine/core";
import type { UseQueryResult } from "@tanstack/react-query";
import { actionTypeLabel } from "@/entities/expert-review";
import {
  proceduralPoolText,
  scenarioItemLabels,
  triggerText,
  useScenarioTemplates,
  type TemplateReference,
} from "@/entities/scenario";
import type { ScenarioDetail, ScenarioItem, ScenarioTemplate } from "@/shared/api";
import { ExpectedResultView } from "@/widgets/expected-result-view";

type TemplateQuery = UseQueryResult<ScenarioTemplate, Error>;

function templateReference(item: ScenarioItem): TemplateReference | null {
  if (item.sourceType !== "TEMPLATE" || item.templateId === null) return null;

  return { kind: item.itemType === "INCOMING_CALL" ? "call" : "card", templateId: item.templateId };
}

function sourceText(item: ScenarioItem, template: TemplateQuery | undefined): string {
  if (item.sourceType === "INLINE") return "встроенная карточка";

  const name = item.templateName ?? "без названия";
  const version = template?.data
    ? `версия ${template.data.version}${template.data.isActive ? "" : ", шаблон деактивирован"}`
    : template?.isError
      ? "версия неизвестна"
      : "версия загружается";

  return `шаблон «${name}», ${version}`;
}

interface SelectedExpected {
  expectedResult: ScenarioTemplate["expectedResult"] | null;
  problem: string | null;
  pending: boolean;
}

function selectedExpected(item: ScenarioItem, template: TemplateQuery | undefined): SelectedExpected {
  if (item.sourceType === "INLINE") return { expectedResult: item.inlineExpectedResult, problem: null, pending: false };
  if (template?.isPending) return { expectedResult: null, problem: null, pending: true };
  if (template?.data) return { expectedResult: template.data.expectedResult, problem: null, pending: false };

  return {
    expectedResult: null,
    problem:
      "Шаблон не загрузился: показан эталон карточки из ответа сценария, статусы реагирования и исходящий звонок недоступны.",
    pending: false,
  };
}

interface ScenarioCompositionProps {
  scenario: ScenarioDetail;
  serviceNames: Map<string, string>;
}

export function ScenarioComposition({ scenario, serviceNames }: ScenarioCompositionProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const { items } = scenario;
  const labels = scenarioItemLabels(items);
  const labelByKey = new Map(items.map((item, index) => [item.key, labels[index] ?? item.key]));
  const references = items.flatMap((item) => templateReference(item) ?? []);
  const templates = useScenarioTemplates(references);
  const templateOf = (item: ScenarioItem) => {
    const index = references.findIndex((reference) => reference.templateId === item.templateId);

    return index >= 0 ? templates[index] : undefined;
  };
  const selected = items.find((item) => item.key === selectedKey) ?? items[0];
  const expected = selected && selectedExpected(selected, templateOf(selected));

  return (
    <Stack gap="sm">
      <Title order={3} size="h5" fw={600}>
        Состав
      </Title>

      {items.length === 0 && scenario.procedural === null && (
        <Paper withBorder p="md">
          <Text size="sm" c="povDark2.6">
            В сценарии нет звонков и карточек.
          </Text>
        </Paper>
      )}

      {items.length > 0 && (
        <Paper withBorder>
          <Table verticalSpacing="sm" layout="fixed">
            <colgroup>
              <col width={120} />
              <col />
              <col width={260} />
              <col width={240} />
            </colgroup>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Элемент</Table.Th>
                <Table.Th>Источник</Table.Th>
                <Table.Th>Когда подаётся</Table.Th>
                <Table.Th>Тип происшествия</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item, index) => (
                <Table.Tr key={item.key}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {labels[index]}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{sourceText(item, templateOf(item))}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {triggerText(item.trigger, (key) => labelByKey.get(key) ?? key, actionTypeLabel)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={item.classification ? undefined : "povDark2.6"}>
                      {item.classification?.finalIncidentType ?? "не задан в эталоне"}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {scenario.procedural && (
        <Paper withBorder p="md">
          <Text size="sm">
            <Text span size="sm" c="povDark2.6">
              Процедурная подача:{" "}
            </Text>
            {proceduralPoolText(scenario.procedural, scenario.difficulty)}
          </Text>
        </Paper>
      )}

      {selected && expected && (
        <Stack gap="sm">
          <Title order={3} size="h5" fw={600}>
            Эталон
          </Title>
          {items.length > 1 && (
            <SegmentedControl
              size="xs"
              radius={2}
              value={selected.key}
              onChange={setSelectedKey}
              data={items.map((item, index) => ({ value: item.key, label: labels[index] ?? item.key }))}
              aria-label="Элемент сценария"
              style={{ alignSelf: "flex-start" }}
            />
          )}
          {expected.pending ? (
            <Skeleton height={240} radius={2} />
          ) : (
            <ExpectedResultView
              key={selected.key}
              itemType={selected.itemType}
              sourceType={selected.sourceType}
              expectedResult={expected.expectedResult}
              fallbackCard={selected.expectedCard}
              problem={expected.problem}
              serviceNames={serviceNames}
            />
          )}
        </Stack>
      )}
    </Stack>
  );
}
