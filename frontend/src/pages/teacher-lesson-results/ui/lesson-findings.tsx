import { useState, type ReactNode } from "react";
import { Anchor, Group, Paper, Skeleton, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { Link } from "react-router-dom";
import { discrepancyLabel, discrepancyValue } from "@/entities/expert-review";
import { abortedScoreHint } from "@/entities/monitoring";
import {
  MIN_ATTEMPTS_FOR_RANKING,
  type AttemptLink,
  type FindingOccurrence,
  type LessonFindingsState,
} from "@/features/teacher-lessons";
import type { EmergencyService, MonitoredSession } from "@/shared/api";
import { criterionLabels } from "@/shared/config";
import { formatShortDateTime } from "@/shared/lib";
import { Button, tooltipEvents } from "@/shared/ui";
import classes from "./lesson-results.module.scss";

const scoreFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });


function reviewHref(link: AttemptLink): string {
  const params = new URLSearchParams();

  if (link.elementKey) params.set("element", link.elementKey);
  if (link.path) params.set("focus", link.path);

  const query = params.toString();

  return `/teacher/attempts/${link.sessionId}/review${query ? `?${query}` : ""}`;
}

function AttemptRow({ link, children }: { link: AttemptLink; children?: ReactNode }) {
  return (
    <div className={classes.occurrence}>
      <div>
        <span className={classes.occurrenceLabel}>{link.elementLabel ?? "попытка"}</span>
        <span className={classes.occurrenceValue}>{link.students}</span>
      </div>
      {children ?? (
        <>
          <span />
          <span />
        </>
      )}
      <Anchor component={Link} to={reviewHref(link)} size="sm" c="povDark.6" underline="always">
        к моменту в разборе
      </Anchor>
    </div>
  );
}

function OccurrenceRow({
  occurrence,
  services,
  showField,
}: {
  occurrence: FindingOccurrence;
  services: Map<string, EmergencyService> | undefined;
  showField: boolean;
}) {
  return (
    <AttemptRow link={occurrence}>
      <div>
        <span className={classes.occurrenceLabel}>
          {showField ? `${discrepancyLabel(occurrence.path, services)}, ожидалось` : "ожидалось"}
        </span>
        <span className={classes.occurrenceValue}>
          {discrepancyValue(occurrence.path, occurrence.expected)}
        </span>
      </div>
      <div>
        <span className={classes.occurrenceLabel}>указано</span>
        <span className={classes.occurrenceValue}>
          {discrepancyValue(occurrence.path, occurrence.actual)}
        </span>
      </div>
    </AttemptRow>
  );
}

function ExpandRow({ span, children }: { span: number; children: ReactNode }) {
  return (
    <Table.Tr>
      <Table.Td colSpan={span} className={classes.expandedCell}>
        {children}
      </Table.Td>
    </Table.Tr>
  );
}

function useExpanded() {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });

  return { expanded, toggle };
}

interface ToggleButtonProps {
  open: boolean;
  label: string;
  count: number;
  onClick: () => void;
}

function ToggleButton({ open, label, count, onClick }: ToggleButtonProps) {
  return (
    <Button size="xs" variant="outline" color="povDark2.6" disabled={count === 0} onClick={onClick}>
      {open ? "Скрыть" : `${label}: ${count}`}
    </Button>
  );
}

interface LessonFindingsProps {
  state: LessonFindingsState;
  interrupted: MonitoredSession[];
  withoutAttempts: string[];
  services: Map<string, EmergencyService> | undefined;
}

export function LessonFindings({ state, interrupted, withoutAttempts, services }: LessonFindingsProps) {
  const { expanded, toggle } = useExpanded();
  const { summary } = state;
  const ranked = summary.analyzed >= MIN_ATTEMPTS_FOR_RANKING;

  return (
    <Stack gap="sm">
      <Title order={3} size="h5" fw={600}>
        Сводка по расхождениям
      </Title>
      <Text size="xs" c="povDark2.6">
        Построена по расхождениям завершённых попыток, которые уже посчитал сервер; на балл не влияет.
        Учтено попыток: <span className={classes.numeric}>{summary.analyzed} из {state.total}</span>.
      </Text>

      {state.pending > 0 && (
        <Group gap="xs">
          <Skeleton height={14} width={220} radius={0} />
          <Text size="xs" c="povDark2.6">
            загружается разборов: <span className={classes.numeric}>{state.pending}</span>
          </Text>
        </Group>
      )}

      {state.failed > 0 && (
        <Group gap="sm">
          <Text size="xs">
            Не загрузились разборы <span className={classes.numeric}>{state.failed}</span> попыток: сводка
            посчитана без них.
          </Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={state.retryFailed}>
            Повторить
          </Button>
        </Group>
      )}

      {state.total === 0 && (
        <Paper withBorder p="md">
          <Text size="sm" c="povDark2.6">
            Завершённых попыток нет: сводка появится после первой завершённой попытки.
          </Text>
        </Paper>
      )}

      {summary.analyzed > 0 && (
        <Paper withBorder>
          <Table verticalSpacing="xs" layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{ranked ? "Критерий, по убыванию" : "Критерий"}</Table.Th>
                {ranked && <Table.Th w={200}>Попыток с расхождениями</Table.Th>}
                <Table.Th w={140} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {summary.criteria.map((criterion) => {
                const key = `criterion:${criterion.code}`;
                const open = !ranked || expanded.has(key);

                return [
                  <Table.Tr key={key}>
                    <Table.Td>
                      <Text size="sm">
                        {criterion.code} {criterionLabels[criterion.code]}
                      </Text>
                    </Table.Td>
                    {ranked && (
                      <Table.Td className={classes.numeric}>
                        <Text size="sm" fw={criterion.attemptsWithFindings > 0 ? 500 : 400}>
                          {criterion.attemptsWithFindings} из {criterion.applicableAttempts}
                        </Text>
                      </Table.Td>
                    )}
                    <Table.Td>
                      {ranked ? (
                        <ToggleButton
                          open={open}
                          label="Расхождения"
                          count={criterion.occurrences.length}
                          onClick={() => toggle(key)}
                        />
                      ) : (
                        <Text size="xs" c="povDark2.6">
                          {criterion.occurrences.length === 0 ? "расхождений нет" : ""}
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>,
                  open && criterion.occurrences.length > 0 && (
                    <ExpandRow key={`${key}:rows`} span={ranked ? 3 : 2}>
                      {criterion.occurrences.map((occurrence, index) => (
                        <OccurrenceRow
                          key={`${occurrence.sessionId}:${index}`}
                          occurrence={occurrence}
                          services={services}
                          showField
                        />
                      ))}
                    </ExpandRow>
                  ),
                ];
              })}
            </Table.Tbody>
          </Table>
          {summary.unattributed.length > 0 && (
            <Stack gap={0} p="sm">
              <Text size="xs" c="povDark2.6">
                Не разложены по критериям — у участников попытки разные роли:
              </Text>
              {summary.unattributed.map((link) => (
                <AttemptRow key={link.sessionId} link={link} />
              ))}
            </Stack>
          )}
        </Paper>
      )}

      {ranked && summary.repeated.length > 0 && (
        <>
          <Title order={4} size="h6" fw={600}>
            Повторяющиеся расхождения
          </Title>
          <Paper withBorder>
            <Table verticalSpacing="xs" layout="fixed">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Поле</Table.Th>
                  <Table.Th>Ожидалось</Table.Th>
                  <Table.Th>Указано</Table.Th>
                  <Table.Th w={130}>Обучаемых</Table.Th>
                  <Table.Th w={140} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {summary.repeated.map((repeated, index) => {
                  const key = `repeated:${index}`;
                  const open = expanded.has(key);

                  return [
                    <Table.Tr key={key}>
                      <Table.Td>
                        <Text size="sm">{discrepancyLabel(repeated.path, services)}</Text>
                      </Table.Td>
                      <Table.Td className={classes.tabular}>
                        <Text size="sm">{discrepancyValue(repeated.path, repeated.expected)}</Text>
                      </Table.Td>
                      <Table.Td className={classes.tabular}>
                        <Text size="sm">{discrepancyValue(repeated.path, repeated.actual)}</Text>
                      </Table.Td>
                      <Table.Td className={classes.numeric}>
                        <Text size="sm" fw={500}>
                          {repeated.studentsCount}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <ToggleButton
                          open={open}
                          label="Расхождения"
                          count={repeated.occurrences.length}
                          onClick={() => toggle(key)}
                        />
                      </Table.Td>
                    </Table.Tr>,
                    open && (
                      <ExpandRow key={`${key}:rows`} span={5}>
                        {repeated.occurrences.map((occurrence, occurrenceIndex) => (
                          <OccurrenceRow
                            key={`${occurrence.sessionId}:${occurrenceIndex}`}
                            occurrence={occurrence}
                            services={services}
                            showField={false}
                          />
                        ))}
                      </ExpandRow>
                    ),
                  ];
                })}
              </Table.Tbody>
            </Table>
          </Paper>
        </>
      )}

      {summary.analyzed > 0 && (
        <>
          <Title order={4} size="h6" fw={600}>
            Сроки службы по карточке
          </Title>
          <Paper withBorder>
            <Table verticalSpacing="xs" layout="fixed">
              <Table.Tbody>
                {[
                  { key: "open", label: "Карточка раскрыта позже срока", links: summary.openMissed },
                  { key: "decision", label: "Решение по карточке позже срока", links: summary.decisionMissed },
                ].map((row) => {
                  const open = expanded.has(row.key);

                  return [
                    <Table.Tr key={row.key}>
                      <Table.Td>
                        <Text size="sm">{row.label}</Text>
                      </Table.Td>
                      <Table.Td w={200} className={classes.numeric}>
                        <Text size="sm" fw={row.links.length > 0 ? 500 : 400}>
                          {row.links.length} из {summary.analyzed}
                        </Text>
                      </Table.Td>
                      <Table.Td w={140}>
                        <ToggleButton
                          open={open}
                          label="Попытки"
                          count={row.links.length}
                          onClick={() => toggle(row.key)}
                        />
                      </Table.Td>
                    </Table.Tr>,
                    open && (
                      <ExpandRow key={`${row.key}:rows`} span={3}>
                        {row.links.map((link) => (
                          <AttemptRow key={link.sessionId} link={link} />
                        ))}
                      </ExpandRow>
                    ),
                  ];
                })}
              </Table.Tbody>
            </Table>
          </Paper>
        </>
      )}

      <Title order={4} size="h6" fw={600}>
        Прерванные попытки
      </Title>
      <Paper withBorder p={interrupted.length === 0 ? "md" : 0}>
        {interrupted.length === 0 ? (
          <Text size="sm" c="povDark2.6">
            Прерванных попыток нет.
          </Text>
        ) : (
          <Table verticalSpacing="xs" layout="fixed">
            <Table.Tbody>
              {interrupted.map((session) => (
                <Table.Tr key={session.sessionId}>
                  <Table.Td>
                    <Text size="sm">
                      {session.participants.map((participant) => participant.displayName).join(", ")}
                    </Text>
                  </Table.Td>
                  <Table.Td w={160}>
                    {session.score === null ? (
                      <Text size="sm" c="povDark2.6">
                        без балла
                      </Text>
                    ) : (
                      <Tooltip label={abortedScoreHint} events={tooltipEvents} color="povDark.6" radius={0}>
                        <Text size="sm" c="povDark2.6" tabIndex={0} className={classes.numeric}>
                          балл {scoreFormatter.format(session.score)}
                        </Text>
                      </Tooltip>
                    )}
                  </Table.Td>
                  <Table.Td w={160} className={classes.numeric}>
                    <Text size="sm">
                      {session.completedAt ? formatShortDateTime(session.completedAt) : "—"}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Title order={4} size="h6" fw={600}>
        Не начали ни одной попытки
      </Title>
      <Paper withBorder p="md">
        <Text size="sm" c={withoutAttempts.length === 0 ? "povDark2.6" : undefined}>
          {withoutAttempts.length === 0
            ? "Все участники назначения начали хотя бы одну попытку."
            : withoutAttempts.join(", ")}
        </Text>
      </Paper>
    </Stack>
  );
}
