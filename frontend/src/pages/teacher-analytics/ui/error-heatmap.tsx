import { Group, Table, Text, Tooltip } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { tooltipEvents } from "@/shared/ui";
import {
  analyticsColumnLabels,
  analyticsColumns,
  columnShares,
  type AnalyticsColumn,
  type AttemptFacts,
  type ColumnShare,
  type StudentStats,
} from "../model/student-stats";
import { errorsConclusion } from "../model/group-insights";
import { AnalyticsCard } from "./analytics-card";
import classes from "./analytics.module.scss";

const LEVELS = 5;
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });

function levelOf(share: ColumnShare): number {
  return share.withErrors === 0 ? 0 : Math.max(1, Math.ceil((share.withErrors / share.applicable) * LEVELS));
}

interface CellProps {
  column: AnalyticsColumn;
  share: ColumnShare | undefined;
  who: string;
  onOpen: (() => void) | null;
}

function HeatCell({ column, share, who, onOpen }: CellProps) {
  if (share === undefined || share.applicable === 0) {
    return (
      <Tooltip label={`${analyticsColumnLabels[column]}: к роли не относится или нет разобранных попыток`} events={tooltipEvents} multiline w={260} color="povDark.6" radius={0}>
        <span className={classes.heatEmpty}>—</span>
      </Tooltip>
    );
  }

  const label = `${who}, ${analyticsColumnLabels[column]}: ошибки в ${share.withErrors} из ${share.applicable} попыток${onOpen ? ". Нажмите — откроется последний разбор" : ""}`;

  return (
    <Tooltip label={label} events={tooltipEvents} multiline w={280} color="povDark.6" radius={0}>
      {onOpen === null ? (
        <span className={classes.heatCell} data-level={levelOf(share)} tabIndex={0}>
          {percent.format(share.withErrors / share.applicable)}
        </span>
      ) : (
        <button type="button" className={classes.heatCell} data-level={levelOf(share)} aria-label={label} onClick={onOpen}>
          {percent.format(share.withErrors / share.applicable)}
        </button>
      )}
    </Tooltip>
  );
}

interface ErrorHeatmapProps {
  stats: StudentStats[];
  facts: AttemptFacts[];
}

export function ErrorHeatmap({ stats, facts }: ErrorHeatmapProps) {
  const navigate = useNavigate();
  const analyzed = facts.filter((attempt) => attempt.errors !== null);
  const total = columnShares(analyzed);
  const rows = [...stats].sort((first, second) => first.name.localeCompare(second.name, "ru"));

  const legend = (
    <Group gap="xs" wrap="wrap" aria-label="Шкала: доля попыток с ошибкой">
      <Text size="xs">доля попыток с ошибкой:</Text>
      {Array.from({ length: LEVELS + 1 }, (_, level) => (
        <span key={level} className={classes.legend}>
          <span className={`${classes.heatCell} ${classes.legendSwatch}`} data-level={level} />
          <Text size="xs" className={classes.numeric}>
            {level === 0 ? "0" : `до ${percent.format(level / LEVELS)}`}
          </Text>
        </span>
      ))}
      <Text size="xs" c="povDark2.6">
        Ячейка — доля попыток обучаемого с ошибкой в группе проверок из разбора. Ошибки только в оформлении текста не
        считаются. «—» — проверка не относится к роли обучаемого.
      </Text>
    </Group>
  );

  return (
    <AnalyticsCard
      title="Тепловая карта ошибок"
      conclusion={analyzed.length === 0 ? "Разборы попыток ещё не загружены." : errorsConclusion(analyzed)}
      actions={null}
      legend={legend}
      wide
    >
      {analyzed.length === 0 ? (
        <Text size="sm" c="povDark2.6">
          Карта строится по расхождениям с эталоном — нужна хотя бы одна завершённая и оценённая сервером попытка.
        </Text>
      ) : (
        <Table.ScrollContainer minWidth={760} type="native">
          <Table verticalSpacing={0} horizontalSpacing={4} withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Обучаемый</Table.Th>
                {analyticsColumns.map((column) => (
                  <Table.Th key={column} ta="center">
                    {analyticsColumnLabels[column]}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((student) => (
                <Table.Tr key={student.studentId}>
                  <Table.Td className={classes.wrap}>{student.name}</Table.Td>
                  {analyticsColumns.map((column) => (
                    <Table.Td key={column} p={0}>
                      <HeatCell
                        column={column}
                        share={student.columns.get(column)}
                        who={student.name}
                        onOpen={() =>
                          navigate(`/teacher/attempts/${student.lastSessionId}/review?participant=${student.studentId}`)
                        }
                      />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
              <Table.Tr className={classes.totalRow}>
                <Table.Td>Итого по выборке</Table.Td>
                {analyticsColumns.map((column) => (
                  <Table.Td key={column} p={0}>
                    <HeatCell column={column} share={total.get(column)} who="Все обучаемые" onOpen={null} />
                  </Table.Td>
                ))}
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </AnalyticsCard>
  );
}
