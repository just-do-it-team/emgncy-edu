import { Table, Text } from "@mantine/core";
import { missedServices, servicesConclusion } from "../model/group-insights";
import type { AttemptFacts } from "../model/student-stats";
import { AnalyticsCard } from "./analytics-card";
import { ShareBar } from "./share-bar";
import classes from "./analytics.module.scss";

const MAX_ROWS = 10;

interface MissedServicesProps {
  facts: AttemptFacts[];
  serviceName: (code: string) => string;
}

export function MissedServices({ facts, serviceName }: MissedServicesProps) {
  const rows = missedServices(facts);

  return (
    <AnalyticsCard
      title="Какие службы забывают оповестить"
      conclusion={servicesConclusion(rows, serviceName)}
      actions={null}
      legend="Строка — служба из эталона при этом типе происшествия: сколько раз её не оказалось в итоговой карточке оператора. Пропуск главной службы — критическая ошибка."
      wide={false}
    >
      {rows.length === 0 ? (
        <Text size="sm" c="povDark2.6">
          Все службы из эталона оповещены.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={460} type="native">
          <Table verticalSpacing="xs" fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Тип происшествия</Table.Th>
                <Table.Th>Служба</Table.Th>
                <Table.Th ta="right">Пропущена</Table.Th>
                <Table.Th w={120}>Доля</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.slice(0, MAX_ROWS).map((row) => (
                <Table.Tr key={`${row.incidentType}\n${row.serviceCode}`}>
                  <Table.Td className={classes.wrap}>{row.incidentType}</Table.Td>
                  <Table.Td className={classes.wrap}>{serviceName(row.serviceCode)}</Table.Td>
                  <Table.Td ta="right" className={classes.numeric}>
                    {row.missed} из {row.total}
                  </Table.Td>
                  <Table.Td>
                    <ShareBar share={row.missed / row.total} label={`${serviceName(row.serviceCode)}, доля пропусков`} />
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
