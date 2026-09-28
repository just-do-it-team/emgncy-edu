import { Paper, Stack, Table, Text } from "@mantine/core";
import { cardSourceTypeLabels } from "@/entities/scenario";
import type { JsonObject, JsonValue } from "@/shared/api";
import { expectedValueLines } from "../model/expected-values";
import classes from "./expected-result.module.scss";

const initialCardFields: [string, string][] = [
  ["source_type", "Источник"],
  ["classification", "Тип происшествия"],
  ["description", "Описание"],
  ["applicant_full_name", "ФИО заявителя"],
  ["automatic_phone_number", "АОН"],
  ["provided_phone_number", "Предоставленный телефон"],
  ["location_phone_number", "Телефон на месте"],
  ["reported_address", "Адрес со слов заявителя"],
  ["incident_address", "Адрес происшествия"],
  ["victims_count", "Пострадавших"],
];

function valueLines(field: string, value: JsonValue | undefined, serviceNames: Map<string, string>): string[] {
  if (field === "source_type" && typeof value === "string") return [cardSourceTypeLabels[value] ?? value];

  return expectedValueLines(field, value, serviceNames);
}

function FieldTable({ rows }: { rows: [string, string[]][] }) {
  return (
    <Paper withBorder>
      <Table verticalSpacing="sm" layout="fixed">
        <colgroup>
          <col width={220} />
          <col />
        </colgroup>
        <Table.Tbody>
          {rows.map(([label, lines]) => (
            <Table.Tr key={label}>
              <Table.Td>
                <Text size="sm" c="povDark2.6">
                  {label}
                </Text>
              </Table.Td>
              <Table.Td>
                <Stack gap={2}>
                  {lines.map((line, index) => (
                    <Text key={index} size="sm" c={index > 0 ? "povDark2.6" : undefined} className={classes.value}>
                      {line}
                    </Text>
                  ))}
                </Stack>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Paper>
  );
}

interface InitialCardViewProps {
  card: JsonObject;
  serviceNames: Map<string, string>;
}

export function InitialCardView({ card, serviceNames }: InitialCardViewProps) {
  return (
    <FieldTable
      rows={initialCardFields.map(([field, label]) => [label, valueLines(field, card[field], serviceNames)])}
    />
  );
}

export function InitialCallView({ call }: { call: JsonObject }) {
  return (
    <FieldTable
      rows={[
        ["Первая реплика заявителя", [typeof call.initial_utterance === "string" ? call.initial_utterance : "—"]],
        ["АОН", [typeof call.automatic_phone_number === "string" ? call.automatic_phone_number : "—"]],
      ]}
    />
  );
}
