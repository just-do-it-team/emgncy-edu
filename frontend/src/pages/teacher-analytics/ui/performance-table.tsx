import { useState } from "react";
import { Anchor, Group, Stack, Table, Text, Tooltip } from "@mantine/core";
import { Link } from "react-router-dom";
import { difficultyLabel } from "@/entities/scenario";
import { downloadCsv, localDayKey, type SortDirection } from "@/shared/lib";
import { Button, SortableTh, tooltipEvents } from "@/shared/ui";
import { TREND_WINDOW } from "../model/analytics-rules";
import { performanceConclusion, studentSides } from "../model/group-insights";
import {
  analyticsColumnLabels,
  readinessLabels,
  type AnalyticsColumn,
  type DifficultyVerdict,
  type StudentStats,
} from "../model/student-stats";
import { AnalyticsCard } from "./analytics-card";
import classes from "./analytics.module.scss";

const score = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });

const adviceText: Record<DifficultyVerdict["advice"], (verdict: DifficultyVerdict) => string> = {
  raise: (verdict) => `повысить до ${verdict.next}`,
  keep: (verdict) => `оставить ${verdict.current}`,
  lower: (verdict) => `понизить до ${verdict.next}`,
};

function Hinted({ label, children }: { label: string; children: string }) {
  return (
    <Tooltip label={label} events={tooltipEvents} multiline w={320} color="povDark.6" radius={0}>
      <Text size="sm" tabIndex={0} td="underline dotted">
        {children}
      </Text>
    </Tooltip>
  );
}

function sideLabel(column: AnalyticsColumn | null): string {
  return column === null ? "—" : analyticsColumnLabels[column];
}

function csvRows(rows: StudentStats[]): string[][] {
  return rows.map((student) => [
    student.name,
    student.groupName ?? "Без группы",
    String(student.attempts.length),
    student.average === null ? "—" : score.format(student.average),
    student.trend === null ? "—" : signed.format(student.trend),
    student.passShare === null ? "—" : percent.format(student.passShare),
    student.normShare === null ? "—" : percent.format(student.normShare),
    sideLabel(studentSides(student).strong),
    sideLabel(studentSides(student).weak),
    student.readiness === null ? "—" : readinessLabels[student.readiness.level],
    student.difficulty === null ? "—" : adviceText[student.difficulty.advice](student.difficulty),
  ]);
}

const CSV_HEADER = [
  "Обучаемый",
  "Группа",
  "Попыток",
  "Средний балл",
  "Тренд",
  "Зачтено",
  "Нормативы 30 с / 3 мин",
  "Сильная сторона",
  "Слабая сторона",
  "Готовность",
  "Сложность следующего занятия",
];

interface PerformanceTableProps {
  stats: StudentStats[];
  onDownloadPdf: (rows: StudentStats[]) => void;
  pdfPending: boolean;
}

export function PerformanceTable({ stats, onDownloadPdf, pdfPending }: PerformanceTableProps) {
  const [direction, setDirection] = useState<SortDirection>("desc");
  const rows = [...stats].sort((first, second) => {
    const difference = (first.average ?? -1) - (second.average ?? -1);

    return direction === "asc" ? difference : -difference;
  });

  return (
    <AnalyticsCard
      title="Успеваемость обучаемых"
      conclusion={performanceConclusion(stats)}
      actions={
        <Group gap="xs">
          <Button
            size="xs"
            variant="outline"
            color="povDark2.6"
            title="С текущими фильтрами группы и периода, UTF-8, разделитель «;»"
            onClick={() => downloadCsv(`Успеваемость_${localDayKey(new Date())}.csv`, CSV_HEADER, csvRows(rows))}
          >
            Скачать CSV
          </Button>
          <Button size="xs" variant="outline" color="povDark2.6" loading={pdfPending} onClick={() => onDownloadPdf(rows)}>
            Скачать PDF
          </Button>
        </Group>
      }
      legend="Сильная сторона — группа проверок с наименьшей долей ошибок, слабая — с наибольшей. Готовность и сложность раскрываются подсказкой."
      wide
    >
        <Table.ScrollContainer minWidth={1140} type="native">
          <Table verticalSpacing="xs" fz="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Обучаемый</Table.Th>
                <Table.Th>Попыток</Table.Th>
                <SortableTh
                  label="Средний балл"
                  hint="Средний итоговый балл: оценка преподавателя, а без неё — автоматическая"
                  direction={direction}
                  onSort={() => setDirection((current) => (current === "desc" ? "asc" : "desc"))}
                />
                <Table.Th>Тренд</Table.Th>
                <Table.Th>Зачтено</Table.Th>
                <Table.Th title="Доля карточек, раскрытых за 30 с и с первой записью за 3 мин">Нормативы</Table.Th>
                <Table.Th>Сильная сторона</Table.Th>
                <Table.Th>Слабая сторона</Table.Th>
                <Table.Th>Готовность</Table.Th>
                <Table.Th>Следующее занятие</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((student) => (
                <Table.Tr key={student.studentId}>
                  <Table.Td className={classes.wrap}>
                    <Anchor
                      component={Link}
                      to={`/teacher/students?student=${student.studentId}`}
                      size="sm"
                      c="povDark2.6"
                      underline="always"
                    >
                      {student.name}
                    </Anchor>
                    <Text size="xs" c="povDark2.6">
                      {student.groupName ?? "без группы"}
                    </Text>
                  </Table.Td>
                  <Table.Td className={classes.numeric}>{student.attempts.length}</Table.Td>
                  <Table.Td className={classes.numeric}>{student.average === null ? "—" : score.format(student.average)}</Table.Td>
                  <Table.Td className={classes.numeric}>
                    {student.trend === null ? (
                      <Text size="sm" c="povDark2.6" title={`Нужно больше ${TREND_WINDOW} попыток`}>
                        —
                      </Text>
                    ) : (
                      signed.format(student.trend)
                    )}
                  </Table.Td>
                  <Table.Td className={classes.numeric}>{student.passShare === null ? "—" : percent.format(student.passShare)}</Table.Td>
                  <Table.Td className={classes.numeric}>
                    {student.normShare === null ? (
                      <Text size="sm" c="povDark2.6" title="У оператора 112 нормативов реакции нет или разборы не загружены">
                        —
                      </Text>
                    ) : (
                      percent.format(student.normShare)
                    )}
                  </Table.Td>
                  <Table.Td className={classes.wrap}>{sideLabel(studentSides(student).strong)}</Table.Td>
                  <Table.Td className={classes.wrap}>{sideLabel(studentSides(student).weak)}</Table.Td>
                  <Table.Td>
                    {student.readiness === null ? (
                      "—"
                    ) : (
                      <Hinted label={student.readiness.reason}>{readinessLabels[student.readiness.level]}</Hinted>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {student.difficulty === null ? (
                      <Text size="sm" c="povDark2.6">
                        сложность сценария неизвестна
                      </Text>
                    ) : (
                      <Stack gap={4} align="flex-start">
                        <Hinted label={student.difficulty.reason}>
                          {`${adviceText[student.difficulty.advice](student.difficulty)} (${difficultyLabel(student.difficulty.next).toLocaleLowerCase("ru")})`}
                        </Hinted>
                        <Button
                          size="compact-xs"
                          variant="outline"
                          color="povDark2.6"
                          component={Link}
                          to={`/teacher/lessons/new?student=${student.studentId}&difficulty=${student.difficulty.next}`}
                        >
                          Назначить занятие
                        </Button>
                      </Stack>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
    </AnalyticsCard>
  );
}
