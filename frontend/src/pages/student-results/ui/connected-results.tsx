import { Fragment, useState } from "react";
import { Alert, Button, Group, List, Loader, Paper, Stack, Table, Text, Title } from "@mantine/core";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { useEmergencyServices } from "@/entities/emergency-service";
import {
  buildReviewBreakdown,
  discrepancyLabel,
  discrepancyValue,
  findingGroups,
  OUTBOUND_CALL_PATH,
  outboundVerdictLines,
  type ClassifierNames,
  type FindingGroup,
} from "@/entities/expert-review";
import { classifierRecordById, routingFlagLabel } from "@/entities/incident";
import {
  fetchSessionActions,
  monitoringKeys,
  monitorNorms,
  normCompliance,
  serviceIdOf,
} from "@/entities/monitoring";
import { useSessionStore } from "@/entities/session";
import { apiError, formatApiDate, statusLabels, trainingApi, trainingKeys, type HistoryItem } from "@/entities/training";
import type { Discrepancy, MonitoredSession, ParticipantRole } from "@/shared/api";
import { criterionLabels, type CriterionCode } from "@/shared/config";
import { Fact, TablePagination, usePagination } from "@/shared/ui";
import { criterionAdvice, mean, scoreTrend, topCriteria } from "../model/my-results";

const HISTORY_LIMIT = 200;
const COMPLETED = "COMPLETED";
const SECOND_MS = 1000;
const ACTIONS_GC_MS = 10 * 60 * 1000;

const score = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const signed = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });

function discrepanciesOf(item: HistoryItem): Discrepancy[] {
  return [...(item.automatic_result.cards ?? []), ...(item.automatic_result.incoming_calls ?? [])].flatMap(
    (element) => element.discrepancies,
  );
}

const classifierNames: ClassifierNames = { recordOf: classifierRecordById, flagLabel: routingFlagLabel };

function findingGroupsOf(item: HistoryItem): FindingGroup[] {
  const sources = (elements: { discrepancies: Discrepancy[] }[], prefix: string) =>
    elements.map((element, index) => ({
      key: `${prefix}:${index}`,
      expectedResult: {},
      currentState: null,
      discrepancies: element.discrepancies,
    }));

  return [
    ...findingGroups(sources(item.automatic_result.incoming_calls ?? [], "call"), classifierNames, "Звонок"),
    ...findingGroups(sources(item.automatic_result.cards ?? [], "card"), classifierNames),
  ].filter((group) => group.discrepancies.length > 0);
}

function durationText(item: HistoryItem): string {
  if (item.completed_at === null) return "—";

  const seconds = Math.max(0, Math.round((Date.parse(item.completed_at) - Date.parse(item.started_at)) / SECOND_MS));

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function historySession(item: HistoryItem): MonitoredSession {
  return {
    sessionId: item.session_id,
    assignmentId: item.assignment_id,
    batchId: null,
    groupName: null,
    scenarioName: item.scenario_name,
    workspaceId: "",
    status: item.status,
    attemptNumber: item.attempt_number,
    startedAt: item.started_at,
    completedAt: item.completed_at,
    score: item.final_score === null ? null : Number(item.final_score),
    passed: item.final_passed,
    automaticScore: null,
    automaticPassed: null,
    teacherAssessed: false,
    lastActivityAt: null,
    participants: [],
  };
}

export function ConnectedResults() {
  const userId = useSessionStore((state) => state.profile?.userId);
  if (!userId) return <Navigate to="/login" replace />;
  return (
    <Stack>
      <Title order={2} size="h4">
        Мои результаты
      </Title>
      <Results key={userId} userId={userId} />
    </Stack>
  );
}

/**
 * Результаты обучаемого — только по его собственным данным: история попыток с автоматическим
 * результатом сервера и журнал действий каждой попытки, который сервер отдаёт участнику. Разбор
 * преподавателя (контекст оценки) обучаемому недоступен, поэтому ошибки показываются так, как их
 * вернул сервер в результате попытки.
 */
function Results({ userId }: { userId: string }) {
  const [opened, setOpened] = useState<string | null>(null);
  const history = useQuery({
    queryKey: trainingKeys.historyPage(userId, 1, HISTORY_LIMIT),
    queryFn: ({ signal }) => trainingApi.history(userId, HISTORY_LIMIT, 0, signal),
    refetchInterval: 15000,
    meta: { showGlobalError: false },
  });
  const assignments = useQuery({
    queryKey: trainingKeys.assignments(userId),
    queryFn: ({ signal }) => trainingApi.assignments(userId, signal),
    meta: { showGlobalError: false },
  });
  const services = useEmergencyServices();
  const items = history.data?.items ?? [];
  const completed = items.filter((item) => item.status === COMPLETED);
  const actions = useQueries({
    queries: completed.map((item) => ({
      queryKey: monitoringKeys.actions(item.session_id),
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchSessionActions(item.session_id, signal),
      staleTime: Infinity,
      gcTime: ACTIONS_GC_MS,
      retry: false,
      meta: { showGlobalError: false },
    })),
  });
  const pagination = usePagination(items);
  const positions = new Map((assignments.data ?? []).map((assignment) => [assignment.id, assignment.participant.position_code]));
  const roleOf = (item: HistoryItem): ParticipantRole => (positions.get(item.assignment_id) ? "DDS" : "OPERATOR_112");
  const criteriaOf = (item: HistoryItem): CriterionCode[] =>
    buildReviewBreakdown(discrepanciesOf(item), roleOf(item)).criteria.flatMap((criterion) =>
      criterion.applicable && criterion.findings.some((finding) => !finding.formattingOnly) ? [criterion.code] : [],
    );
  const norms = completed.reduce(
    (sum, item, index) => {
      const log = actions[index]?.data;
      const position = positions.get(item.assignment_id) ?? null;

      if (log === undefined || position === null) return sum;

      const result = normCompliance(
        {
          participant: { userId, name: "", role: "DDS", positionCode: position },
          session: historySession(item),
          actions: log,
          serviceId: serviceIdOf(position, services.data),
          soleDispatcher: true,
        },
        Date.now(),
        monitorNorms,
      );

      return { checks: sum.checks + result.checks, violations: sum.violations + result.violations };
    },
    { checks: 0, violations: 0 },
  );
  const scores = [...completed]
    .reverse()
    .flatMap((item) => (item.final_score === null ? [] : [Number(item.final_score)]));
  const average = mean(scores);
  const trend = scoreTrend(scores);
  const top = topCriteria(completed.map(criteriaOf));

  if (history.isPending) return <Loader size="sm" />;

  return (
    <Stack>
      {history.isError && (
        <Alert color="red">
          {apiError(history.error)}{" "}
          <Button variant="subtle" onClick={() => void history.refetch()}>
            Повторить
          </Button>
        </Alert>
      )}

      {completed.length > 0 && (
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Group gap="xl" wrap="wrap">
              <Fact label="Завершённых попыток">{completed.length}</Fact>
              <Fact label="Средний итоговый балл">{average === null ? "—" : score.format(average)}</Fact>
              <Fact label="Динамика">{trend === null ? "нужно больше трёх попыток" : signed.format(trend)}</Fact>
              <Fact label="В нормативе 30 с / 3 мин">
                {norms.checks === 0 ? "нет завершённых попыток ДДС" : percent.format((norms.checks - norms.violations) / norms.checks)}
              </Fact>
            </Group>
            {top.length > 0 && (
              <Group align="flex-start" gap="xl" wrap="wrap">
                <Stack gap={4}>
                  <Text size="sm" fw={600}>
                    Главные ошибки
                  </Text>
                  <List size="sm" spacing={2}>
                    {top.map((item) => (
                      <List.Item key={item.code}>
                        {criterionLabels[item.code]} — в {item.attempts} из {completed.length} попыток
                      </List.Item>
                    ))}
                  </List>
                </Stack>
                <Stack gap={4} maw={640}>
                  <Text size="sm" fw={600}>
                    Рекомендации
                  </Text>
                  <List size="sm" spacing={2}>
                    {top.map((item) => (
                      <List.Item key={item.code}>{criterionAdvice[item.code]}</List.Item>
                    ))}
                  </List>
                </Stack>
              </Group>
            )}
          </Stack>
        </Paper>
      )}

      <Paper withBorder>
        <Table.ScrollContainer minWidth={1080}>
          <Table verticalSpacing="md" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                {["Занятие", "Попытка", "Начало", "Время", "Статус", "Итоговый балл", "Результат", "Ошибок", "Комментарий преподавателя", ""].map(
                  (title, index) => (
                    <Table.Th key={`${title}:${index}`}>{title}</Table.Th>
                  ),
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagination.rows.map((item) => {
                const discrepancies = discrepanciesOf(item);
                const expanded = opened === item.session_id;

                return (
                  <Fragment key={item.session_id}>
                    <Table.Tr>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {item.scenario_name}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{item.attempt_number}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{formatApiDate(item.started_at)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{durationText(item)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{statusLabels[item.status] ?? item.status}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {item.final_score ?? "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {item.final_passed === null ? "Не оценено" : item.final_passed ? "Зачёт" : "Незачёт"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{item.status === COMPLETED ? discrepancies.length : "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{item.expert_comment ?? "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        {discrepancies.length > 0 && (
                          <Button
                            size="compact-xs"
                            variant="outline"
                            color="povDark2.6"
                            aria-expanded={expanded}
                            onClick={() => setOpened(expanded ? null : item.session_id)}
                          >
                            {expanded ? "Свернуть" : "Разбор"}
                          </Button>
                        )}
                      </Table.Td>
                    </Table.Tr>
                    {expanded && (
                      <Table.Tr>
                        <Table.Td colSpan={10}>
                          <Stack gap={4}>
                            <Text size="xs" c="povDark2.6">
                              Расхождения с эталоном, которые нашёл сервер. Подробный разбор с записью звонка доступен
                              преподавателю.
                            </Text>
                            {findingGroupsOf(item).map((group) => (
                              <Stack key={group.key} gap={2}>
                                <Text size="sm" fw={600}>
                                  {group.title}
                                </Text>
                                {group.discrepancies
                                  .filter((discrepancy) => discrepancy.path !== OUTBOUND_CALL_PATH)
                                  .map((discrepancy, index) => (
                                    <Text key={`${discrepancy.path}:${index}`} size="sm">
                                      {discrepancyLabel(discrepancy.path, services.data)}: ожидалось «
                                      {discrepancyValue(discrepancy.path, discrepancy.expected)}», указано «
                                      {discrepancyValue(discrepancy.path, discrepancy.actual)}»
                                    </Text>
                                  ))}
                                {group.verdict !== null && (
                                  <>
                                    <Text size="sm" fw={500}>
                                      Доклад руководителю бригады — проверка моделью
                                    </Text>
                                    {outboundVerdictLines(group.verdict).map((line) => (
                                      <Text key={line} size="sm">
                                        {line}
                                      </Text>
                                    ))}
                                  </>
                                )}
                              </Stack>
                            ))}
                          </Stack>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Fragment>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {items.length > 0 && (
          <TablePagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        )}
      </Paper>
      {items.length === 0 && (
        <Text c="dimmed">История занятий пока пуста. Начните назначенное занятие на странице «Обзор».</Text>
      )}
    </Stack>
  );
}
