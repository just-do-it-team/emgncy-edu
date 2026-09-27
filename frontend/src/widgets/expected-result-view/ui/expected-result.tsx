import { Paper, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { Info } from "lucide-react";
import {
  checkModeOf,
  comparisonHints,
  comparisonLabels,
  expectedCardFields,
  statusCommentComparison,
  type CheckMode,
  type ComparisonMethod,
} from "@/entities/scenario";
import type { JsonObject, JsonValue, ScenarioItemType, ScenarioSourceType } from "@/shared/api";
import { tooltipEvents } from "@/shared/ui";
import {
  expectedCardOf,
  expectedValueLines,
  outboundCallRule,
  serviceName,
  statusHistory,
} from "../model/expected-values";
import classes from "./expected-result.module.scss";

const checkModeLabels: Record<CheckMode, string> = {
  checked: "проверяется",
  not_checked: "не проверяется",
  must_be_empty: "должно быть пустым",
};

const similarityFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

function ComparisonNote({ label, hint }: { label: string; hint: string }) {
  return (
    <Tooltip label={hint} events={tooltipEvents} multiline w={320} color="povDark.6" radius={0}>
      <Text size="xs" c="povDark2.6" className={classes.warning} tabIndex={0}>
        <Info size={12} aria-hidden="true" />
        {label}
      </Text>
    </Tooltip>
  );
}

function ModeCell({ mode, comparison }: { mode: CheckMode; comparison: ComparisonMethod }) {
  if (mode !== "not_checked" && comparison === "not_scored") {
    return <ComparisonNote label={comparisonLabels.not_scored} hint={comparisonHints.not_scored} />;
  }

  return (
    <Stack gap={2}>
      <Text size="sm" c={mode === "not_checked" ? "povDark2.6" : undefined} fw={mode === "checked" ? 500 : undefined}>
        {checkModeLabels[mode]}
      </Text>
      {mode === "checked" && comparison === "normalized" && (
        <ComparisonNote label="без учёта регистра и пунктуации" hint={comparisonHints.normalized} />
      )}
    </Stack>
  );
}

interface ExpectedCardTableProps {
  sourceType: ScenarioSourceType;
  card: JsonObject;
  serviceNames: Map<string, string>;
}

function ExpectedCardTable({ sourceType, card, serviceNames }: ExpectedCardTableProps) {
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
          {expectedCardFields.map(({ field, label, comparison }) => {
            const mode = checkModeOf(sourceType, card, field);

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
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <ModeCell mode={mode} comparison={comparison} />
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
                              <ComparisonNote label={statusCommentComparison} hint={comparisonHints.not_scored} />
                            </>
                          )}
                        </Stack>
                      ))}
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <ModeCell mode="checked" comparison="strict" />
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

interface ExpectedResultViewProps {
  itemType: ScenarioItemType;
  sourceType: ScenarioSourceType;
  expectedResult: JsonObject | null;
  fallbackCard: JsonObject | null;
  problem: string | null;
  serviceNames: Map<string, string>;
}

export function ExpectedResultView({
  itemType,
  sourceType,
  expectedResult,
  fallbackCard,
  problem,
  serviceNames,
}: ExpectedResultViewProps) {
  const card = expectedCardOf(expectedResult, fallbackCard);
  const isCall = itemType === "INCOMING_CALL";

  return (
    <Stack gap="sm">
      <Text size="sm" c="povDark2.6">
        {isCall
          ? "Эталон звонка одновременно — знания виртуального заявителя: всё, что задано ниже, заявитель знает и может сказать, незаданное он «не знает»."
          : "Список служб в эталоне определяет, в какие службы уйдёт карточка при выпуске: диспетчер ДДС увидит её, только если его служба есть в списке."}
      </Text>
      {problem && (
        <Text size="sm" c="povDark2.6">
          {problem}
        </Text>
      )}
      {card === null ? (
        <Text size="sm" c="povDark2.6">
          Сервер не вернул эталон карточки для этого элемента.
        </Text>
      ) : (
        <ExpectedCardTable sourceType={sourceType} card={card} serviceNames={serviceNames} />
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
