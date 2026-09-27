import { Paper, Stack, Table, Text, Title } from "@mantine/core";
import { TriangleAlert } from "lucide-react";
import {
  checkModeOf,
  expectedCardFields,
  literalComparisonWarning,
  type CheckMode,
} from "@/entities/scenario";
import type { JsonObject, JsonValue, ScenarioItem } from "@/shared/api";
import {
  expectedCardOf,
  expectedValueLines,
  outboundCallRule,
  serviceName,
  statusHistory,
} from "../model/expected-values";
import classes from "./scenario-card.module.scss";

const checkModeLabels: Record<CheckMode, string> = {
  checked: "проверяется",
  not_checked: "не проверяется",
  must_be_empty: "должно быть пустым",
};

const similarityFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

function LiteralWarning() {
  return (
    <Text size="xs" c="povDark2.6" className={classes.warning}>
      <TriangleAlert size={12} aria-hidden="true" />
      {literalComparisonWarning}
    </Text>
  );
}

function ModeCell({ mode }: { mode: CheckMode }) {
  return (
    <Text size="sm" c={mode === "not_checked" ? "povDark2.6" : undefined} fw={mode === "checked" ? 500 : undefined}>
      {checkModeLabels[mode]}
    </Text>
  );
}

interface ExpectedCardTableProps {
  item: ScenarioItem;
  card: JsonObject;
  serviceNames: Map<string, string>;
}

function ExpectedCardTable({ item, card, serviceNames }: ExpectedCardTableProps) {
  return (
    <Paper withBorder>
      <Table verticalSpacing="sm" layout="fixed">
        <colgroup>
          <col width={220} />
          <col />
          <col width={170} />
        </colgroup>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Поле</Table.Th>
            <Table.Th>Значение в эталоне</Table.Th>
            <Table.Th>Проверка</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {expectedCardFields.map(({ field, label, literal }) => {
            const mode = checkModeOf(item.sourceType, card, field);

            return (
              <Table.Tr key={field}>
                <Table.Td>
                  <Text size="sm">{label}</Text>
                </Table.Td>
                <Table.Td>
                  <Stack gap={2}>
                    {expectedValueLines(field, card[field], serviceNames).map((line, index) => (
                      <Text key={index} size="sm" c={index > 0 ? "povDark2.6" : undefined} className={classes.value}>
                        {line}
                      </Text>
                    ))}
                    {literal && mode === "checked" && <LiteralWarning />}
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <ModeCell mode={mode} />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

function StatusHistory({ value, serviceNames }: { value: JsonValue | undefined; serviceNames: Map<string, string> }) {
  const history = statusHistory(value);

  return (
    <Stack gap="xs">
      <Title order={4} size="h6" fw={600}>
        Статусы реагирования
      </Title>
      {history.length === 0 ? (
        <Text size="sm" c="povDark2.6">
          Цепочка статусов в эталоне не задана и не проверяется.
        </Text>
      ) : (
        <Paper withBorder>
          <Table verticalSpacing="sm" layout="fixed">
            <colgroup>
              <col width={220} />
              <col />
              <col width={170} />
            </colgroup>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Служба</Table.Th>
                <Table.Th>Статусы по порядку</Table.Th>
                <Table.Th>Проверка</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {history.map(([code, steps]) => (
                <Table.Tr key={code}>
                  <Table.Td>
                    <Text size="sm">{serviceName(code, serviceNames)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      {steps.map((step, index) => (
                        <Stack key={index} gap={0}>
                          <Text size="sm">
                            {index + 1}. {step.status}
                            {step.unitNumber ? `, подразделение №${step.unitNumber} (не оценивается)` : ""}
                          </Text>
                          {step.comment && (
                            <>
                              <Text size="sm" c="povDark2.6" className={classes.value}>
                                Комментарий: {step.comment}
                              </Text>
                              <LiteralWarning />
                            </>
                          )}
                        </Stack>
                      ))}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <ModeCell mode="checked" />
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

function OutboundCall({ value }: { value: JsonValue | undefined }) {
  const rule = outboundCallRule(value);

  return (
    <Stack gap="xs">
      <Title order={4} size="h6" fw={600}>
        Исходящий звонок бригаде
      </Title>
      {rule === null ? (
        <Text size="sm" c="povDark2.6">
          Исходящий звонок в эталоне не задан и не проверяется.
        </Text>
      ) : (
        <Paper withBorder p="md">
          <Stack gap={4}>
            <Text size="sm" className={classes.value}>
              {rule.expectedText}
            </Text>
            <Text size="xs" c="povDark2.6">
              Проверяет модель по смысловому сходству, порог {similarityFormatter.format(rule.minimumSimilarity)}.
            </Text>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

interface ExpectedResultProps {
  item: ScenarioItem;
  expectedResult: JsonObject | null;
  templateProblem: string | null;
  serviceNames: Map<string, string>;
}

export function ExpectedResult({ item, expectedResult, templateProblem, serviceNames }: ExpectedResultProps) {
  const card = expectedCardOf(expectedResult, item.expectedCard);
  const isCall = item.itemType === "INCOMING_CALL";

  return (
    <Stack gap="sm">
      <Text size="sm" c="povDark2.6">
        {isCall
          ? "Эталон звонка одновременно — знания виртуального заявителя: всё, что задано ниже, заявитель знает и может сказать, незаданное он «не знает»."
          : "Список служб в эталоне определяет, в какие службы уйдёт карточка при выпуске: диспетчер ДДС увидит её, только если его служба есть в списке."}
      </Text>
      {templateProblem && (
        <Text size="sm" c="povDark2.6">
          {templateProblem}
        </Text>
      )}
      {card === null ? (
        <Text size="sm" c="povDark2.6">
          Сервер не вернул эталон карточки для этого элемента.
        </Text>
      ) : (
        <ExpectedCardTable item={item} card={card} serviceNames={serviceNames} />
      )}
      {!isCall && expectedResult !== null && (
        <>
          <StatusHistory value={expectedResult.service_status_history} serviceNames={serviceNames} />
          <OutboundCall value={expectedResult.outbound_call} />
        </>
      )}
    </Stack>
  );
}
