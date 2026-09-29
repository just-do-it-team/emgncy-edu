import { Table, Text } from "@mantine/core";
import { charSpans } from "@/shared/lib";
import { addressConclusion, type AddressSummary } from "../model/group-insights";
import { AnalyticsCard } from "./analytics-card";
import classes from "./analytics.module.scss";

function Highlighted({ value, reference }: { value: string; reference: string }) {
  return (
    <>
      {charSpans(value, reference).map((span, index) =>
        span.changed ? (
          <span key={index} className={classes.changed}>
            {span.text}
          </span>
        ) : (
          <span key={index}>{span.text}</span>
        ),
      )}
    </>
  );
}

export function AddressErrors({ summary }: { summary: AddressSummary }) {
  return (
    <AnalyticsCard
      title="Ошибки в адресах"
      conclusion={addressConclusion(summary)}
      actions={null}
      legend="Подчёркнуты отличающиеся символы. Одна буква меняет улицу: «Дубнинская» и «Дубининская» — разные улицы Москвы, и такая ошибка отправляет выезд по другому адресу."
      wide={false}
    >
      {summary.examples.length === 0 ? (
        <Text size="sm" c="povDark2.6">
          {summary.checked === 0
            ? "Адрес со слов заявителя вводит оператор 112; блок заполнится после разобранной попытки со звонком."
            : "Расхождений в адресе со слов заявителя нет."}
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={420} type="native">
          <Table verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Ожидалось</Table.Th>
                <Table.Th>Ввёл обучаемый</Table.Th>
                <Table.Th ta="right">Раз</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {summary.examples.map((example) => (
                <Table.Tr key={`${example.expected}\n${example.actual}`}>
                  <Table.Td className={classes.wrap}>
                    <Highlighted value={example.expected} reference={example.actual} />
                  </Table.Td>
                  <Table.Td className={classes.wrap}>
                    <Highlighted value={example.actual} reference={example.expected} />
                  </Table.Td>
                  <Table.Td ta="right" className={classes.numeric}>
                    {example.count}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </AnalyticsCard>
  );
}
