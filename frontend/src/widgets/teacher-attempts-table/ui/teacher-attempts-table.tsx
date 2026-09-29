import {
  Alert,
  Anchor,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import type { UseQueryResult } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Link } from "react-router-dom";
import {
  ABORTED_SESSION_STATUS,
  abortedScoreHint,
  attemptDeadline,
  attemptResultKind,
  attemptResultLabel,
  type AttemptResultKind,
  formatDeviation,
  formatFillTime,
  participantRoleLabels,
  isReviewable,
  reviewAccessHint,
  reviewQueueLabels,
  reviewQueueState,
  type AttemptMetrics,
  type ReviewQueueState,
} from "@/entities/monitoring";
import type { MonitoredSession, TeacherAssignment } from "@/shared/api";
import { compareNullable, downloadCsv, formatShortDateTime, sortRows, useTableQuery } from "@/shared/lib";
import {
  Button,
  FilteredEmpty,
  LinkRow,
  SortableTh,
  TablePagination,
  tooltipEvents,
  usePagination,
  StatusPill,
  type PillTone,
} from "@/shared/ui";
import classes from "./teacher-attempts-table.module.scss";

const SHARED_WORKSPACE = "SHARED";

const SORT_KEYS = ["student", "lesson", "completed", "score"] as const;
const FILTER_KEYS = ["review", "result", "role", "group", "deadline", "scoreOp", "score"] as const;

const ALL_ATTEMPTS = "all";
const reviewQueueOrder: ReviewQueueState[] = ["pending", "confirmed", "corrected"];

function isReviewQueueState(value: string | null): value is ReviewQueueState {
  return reviewQueueOrder.some((state) => state === value);
}

const SCORE_EPSILON = 0.005;

const scoreOperators = {
  gt: { label: "больше", test: (score: number, value: number) => score > value },
  lt: { label: "меньше", test: (score: number, value: number) => score < value },
  eq: { label: "равно", test: (score: number, value: number) => Math.abs(score - value) < SCORE_EPSILON },
  gte: { label: "не меньше", test: (score: number, value: number) => score >= value },
  lte: { label: "не больше", test: (score: number, value: number) => score <= value },
};

type ScoreOperator = keyof typeof scoreOperators;

const scoreOperatorOptions = Object.entries(scoreOperators).map(([value, operator]) => ({
  value,
  label: operator.label,
}));

function isScoreOperator(value: string | null): value is ScoreOperator {
  return value !== null && value in scoreOperators;
}

function matchesScore(session: MonitoredSession, operator: string | null, rawValue: string | null): boolean {
  const value = rawValue === null ? Number.NaN : Number(rawValue);

  if (!isScoreOperator(operator) || !Number.isFinite(value)) return true;
  if (session.score === null) return false;

  return scoreOperators[operator].test(session.score, value);
}

const scoreFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

const resultOptions = [
  { value: "passed", label: "Зачёт" },
  { value: "failed", label: "Не зачтено" },
  { value: "aborted", label: "Прервана" },
];

const roleOptions = Object.entries(participantRoleLabels).map(([value, label]) => ({ value, label }));

const deadlineOptions = [
  { value: "on_time", label: "В срок" },
  { value: "late", label: "С опозданием" },
];

function timeOf(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

function newestFirst(value: string | null): number | null {
  return value === null ? null : -Date.parse(value);
}

function studentsLabel(session: MonitoredSession): string {
  return session.participants.map((participant) => participant.displayName).join(", ");
}

function rolesOf(session: MonitoredSession): string {
  const roles = new Set(session.participants.map((participant) => participantRoleLabels[participant.role]));

  return [...roles].join(", ") || "—";
}

function reviewPath(session: MonitoredSession, participantId?: string): string {
  const base = `/teacher/attempts/${session.sessionId}/review`;

  return participantId ? `${base}?participant=${participantId}` : base;
}

function groupOf(session: MonitoredSession, assignment: TeacherAssignment | undefined): string | null {
  return assignment?.workspaceMode === SHARED_WORKSPACE ? session.groupName : null;
}

function StudentsCell({ session, groupLinkShown }: { session: MonitoredSession; groupLinkShown: boolean }) {
  const reviewable = isReviewable(session.status);
  const needsAttemptLink = reviewable && session.participants.length > 1 && !groupLinkShown;

  if (session.participants.length === 0) return <Text size="sm">—</Text>;

  return (
    <Text size="sm" lineClamp={2}>
      {needsAttemptLink && (
        <VisuallyHidden renderRoot={(props) => <Link {...props} to={reviewPath(session)} data-row-link />}>
          Открыть разбор попытки группы
        </VisuallyHidden>
      )}
      {session.participants.map((participant, index) => (
        <span key={participant.userId}>
          {index > 0 && ", "}
          {reviewable ? (
            <Anchor
              component={Link}
              to={reviewPath(session, participant.userId)}
              size="sm"
              c="povDark2.6"
              underline="never"
              data-row-link={session.participants.length === 1 || undefined}
            >
              {participant.displayName}
            </Anchor>
          ) : (
            participant.displayName
          )}
        </span>
      ))}
    </Text>
  );
}

function GroupCell({ session, group }: { session: MonitoredSession; group: string | null }) {
  if (group === null) return <Text size="sm">—</Text>;

  return isReviewable(session.status) ? (
    <Anchor
      component={Link}
      to={reviewPath(session)}
      size="sm"
      c="povDark2.6"
      underline="always"
      data-row-link={session.participants.length > 1 || undefined}
    >
      <Text span size="sm" lineClamp={1}>
        {group}
      </Text>
    </Anchor>
  ) : (
    <Text size="sm" lineClamp={1}>
      {group}
    </Text>
  );
}

function passedText(passed: boolean | null): string {
  return passed === null ? "без решения о зачёте" : passed ? "зачтено" : "не зачтено";
}

function ScoreCell({ session }: { session: MonitoredSession }) {
  if (session.teacherAssessed && session.score !== null) {
    const automaticText =
      session.automaticScore === null
        ? "не рассчитан"
        : `${scoreFormatter.format(session.automaticScore)}, ${passedText(session.automaticPassed)}`;

    return (
      <Tooltip label={`Автоматически: ${automaticText}`} events={tooltipEvents} color="povDark.6" radius={0}>
        <div tabIndex={0} className={classes.focusable}>
          <Text size="sm" fw={600} className={classes.numeric}>
            {scoreFormatter.format(session.score)}
          </Text>
          <Text size="xs" c="povDark2.6">
            оценка преподавателя
          </Text>
        </div>
      </Tooltip>
    );
  }

  if (session.score === null) {
    return (
      <Text size="sm" className={classes.numeric}>
        —
      </Text>
    );
  }

  if (session.status === ABORTED_SESSION_STATUS) {
    return (
      <Tooltip label={abortedScoreHint} events={tooltipEvents} color="povDark.6" radius={0}>
        <Text size="sm" c="povDark2.6" tabIndex={0} className={`${classes.numeric} ${classes.focusable}`}>
          {scoreFormatter.format(session.score)}
        </Text>
      </Tooltip>
    );
  }

  return (
    <Text size="sm" fw={600} className={classes.numeric}>
      {scoreFormatter.format(session.score)}
    </Text>
  );
}

const resultTones: Record<AttemptResultKind, PillTone> = {
  passed: "green",
  failed: "red",
  aborted: "gray",
  other: "blue",
};

function ResultCell({ session }: { session: MonitoredSession }) {
  const hint = reviewAccessHint(session.status);

  const pill = <StatusPill tone={resultTones[attemptResultKind(session)]}>{attemptResultLabel(session)}</StatusPill>;

  if (hint === null) return pill;

  return (
    <Tooltip label={hint} events={tooltipEvents} color="povDark.6" radius={0}>
      <span tabIndex={0} className={classes.focusable}>
        {pill}
      </span>
    </Tooltip>
  );
}

function DeadlineCell({ session, assignment }: { session: MonitoredSession; assignment: TeacherAssignment | undefined }) {
  const deadline = attemptDeadline(session, assignment);

  if (deadline === "none" || !assignment?.dueAt || !session.completedAt) {
    return <Text size="sm">—</Text>;
  }

  const due = formatShortDateTime(assignment.dueAt);
  const fact = formatShortDateTime(session.completedAt);
  const late = deadline === "late";
  const Icon = late ? X : Check;

  return (
    <Tooltip
      label={`Срок: ${due}\nФакт: ${fact}`}
      events={tooltipEvents}
      color="povDark.6"
      radius={0}
      classNames={{ tooltip: classes.tooltipLines }}
    >
      <span
        role="img"
        tabIndex={0}
        aria-label={`${late ? "С опозданием" : "В срок"}: срок ${due}, факт ${fact}`}
        className={`${classes.deadline} ${late ? classes.late : classes.onTime}`}
      >
        <Icon size={16} aria-hidden="true" />
      </span>
    </Tooltip>
  );
}

const deadlineLabels = { on_time: "в срок", late: "с опозданием", none: "—" } as const;

function metricText(value: number | null): string {
  return value === null ? "—" : String(value);
}

interface TeacherAttemptsTableProps {
  query: UseQueryResult<MonitoredSession[], Error>;
  metrics: Map<string, AttemptMetrics> | null;
  csvName: string | null;
  sessions: MonitoredSession[];
  assignments: Map<string, TeacherAssignment> | undefined;
  showGroup: boolean;
  queryPrefix: string;
  emptyTitle: string;
  emptyHint: string;
}

export function TeacherAttemptsTable({
  query,
  metrics,
  csvName,
  sessions,
  assignments,
  showGroup,
  queryPrefix,
  emptyTitle,
  emptyHint,
}: TeacherAttemptsTableProps) {
  const table = useTableQuery(queryPrefix, SORT_KEYS, FILTER_KEYS);
  const assignmentOf = (session: MonitoredSession) => assignments?.get(session.assignmentId);
  const reviewFilter = table.filter("review");
  const review = isReviewQueueState(reviewFilter) ? reviewFilter : null;
  const queueCounts = new Map(
    reviewQueueOrder.map((state) => [state, sessions.filter((session) => reviewQueueState(session) === state).length]),
  );
  const result = table.filter("result");
  const role = table.filter("role");
  const group = showGroup ? table.filter("group") : null;
  const deadline = table.filter("deadline");
  const scoreOperator = table.filter("scoreOp");
  const scoreValue = table.filter("score");

  const visible = sortRows(
    sessions.filter(
      (session) =>
        (review === null || reviewQueueState(session) === review) &&
        (result === null || attemptResultKind(session) === result) &&
        (role === null || session.participants.some((participant) => participant.role === role)) &&
        (group === null || groupOf(session, assignmentOf(session)) === group) &&
        (deadline === null || attemptDeadline(session, assignmentOf(session)) === deadline) &&
        matchesScore(session, scoreOperator, scoreValue),
    ),
    table.sort,
    {
      student: studentsLabel,
      lesson: (session) => session.scenarioName,
      completed: (session) => timeOf(session.completedAt),
      score: (session) => session.score,
    },
    (first, second) => compareNullable(newestFirst(first.completedAt), newestFirst(second.completedAt)),
  );
  const pagination = usePagination(visible);
  const exportCsv = (fileName: string) =>
    downloadCsv(
      fileName,
      [
        "Обучаемый",
        ...(showGroup ? ["Группа"] : []),
        "Занятие",
        "Роль",
        "Завершена",
        "Итоговый балл",
        "Оценка",
        "Результат",
        "В срок",
        ...(metrics ? ["Заполнение карточки", "Отклонение от норматива", "Орфографических ошибок"] : []),
      ],
      visible.map((session) => {
        const metric = metrics?.get(session.sessionId);

        return [
          studentsLabel(session),
          ...(showGroup ? [groupOf(session, assignmentOf(session)) ?? "Без группы"] : []),
          session.scenarioName,
          rolesOf(session),
          session.completedAt ? formatShortDateTime(session.completedAt) : "—",
          session.score === null ? "—" : scoreFormatter.format(session.score),
          session.teacherAssessed ? "преподавателя" : "автоматическая",
          attemptResultLabel(session),
          deadlineLabels[attemptDeadline(session, assignmentOf(session))],
          ...(metrics
            ? [formatFillTime(metric?.fillMs ?? null), formatDeviation(metric?.deviationMs ?? null), metricText(metric?.misspellings ?? null)]
            : []),
        ];
      }),
    );
  const groupOptions = [
    ...new Set(sessions.flatMap((session) => groupOf(session, assignmentOf(session)) ?? [])),
  ].map((value) => ({ value, label: value }));

  if (query.isPending) {
    return (
      <Paper withBorder p="md">
        <Stack gap="xs">
          {[0, 1, 2, 3, 4].map((row) => (
            <Skeleton key={row} height={28} radius={2} />
          ))}
        </Stack>
      </Paper>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить попытки">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={() => query.refetch()}>
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  if (sessions.length === 0) {
    return (
      <Paper withBorder p="md">
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            {emptyTitle}
          </Text>
          <Text size="sm" c="povDark2.6">
            {emptyHint}
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Stack gap="xs">
      <SegmentedControl
        size="xs"
        radius={2}
        color="povDark2.6"
        w="fit-content"
        maw="100%"
        aria-label="Очередь проверки"
        data={[
          { value: ALL_ATTEMPTS, label: `Все ${sessions.length}` },
          ...reviewQueueOrder.map((state) => ({ value: state, label: `${reviewQueueLabels[state]} ${queueCounts.get(state) ?? 0}` })),
        ]}
        value={review ?? ALL_ATTEMPTS}
        onChange={(value) => table.setFilter("review", value === ALL_ATTEMPTS ? null : value)}
      />
      <Group gap="sm" wrap="wrap">
        <Select
          size="xs"
          w={170}
          placeholder="Результат: все"
          aria-label="Фильтр по результату"
          data={resultOptions}
          value={result}
          onChange={(value) => table.setFilter("result", value)}
          clearable
        />
        <Select
          size="xs"
          w={170}
          placeholder="Роль: все"
          aria-label="Фильтр по роли"
          data={roleOptions}
          value={role}
          onChange={(value) => table.setFilter("role", value)}
          clearable
        />
        {showGroup && (
          <Select
            size="xs"
            w={200}
            placeholder="Группа: все"
            aria-label="Фильтр по группе"
            data={groupOptions}
            value={group}
            onChange={(value) => table.setFilter("group", value)}
            clearable
          />
        )}
        <Select
          size="xs"
          w={170}
          placeholder="Срок: все"
          aria-label="Фильтр по сроку"
          data={deadlineOptions}
          value={deadline}
          onChange={(value) => table.setFilter("deadline", value)}
          clearable
        />
        <Group gap={4} wrap="nowrap">
          <Select
            size="xs"
            w={130}
            placeholder="Балл: любой"
            aria-label="Условие по баллу"
            data={scoreOperatorOptions}
            value={scoreOperator}
            onChange={(value) => table.setFilter("scoreOp", value)}
            clearable
          />
          <NumberInput
            size="xs"
            w={90}
            placeholder="0–100"
            aria-label="Значение балла"
            min={0}
            max={100}
            decimalScale={2}
            decimalSeparator=","
            clampBehavior="strict"
            hideControls
            value={scoreValue === null ? "" : Number(scoreValue)}
            onChange={(value) => table.setFilter("score", value === "" ? null : String(value))}
          />
        </Group>
        {csvName !== null && (
          <Button
            size="xs"
            variant="outline"
            color="povDark2.6"
            disabled={visible.length === 0}
            title="Попытки с текущими фильтрами, UTF-8, разделитель «;»"
            onClick={() => exportCsv(csvName)}
          >
            Скачать CSV
          </Button>
        )}
      </Group>

      {visible.length === 0 ? (
        <FilteredEmpty onReset={table.resetFilters} />
      ) : (
        <Paper withBorder>
          <Table verticalSpacing="sm" highlightOnHover layout="fixed">
            <Table.Thead>
              <Table.Tr>
                <SortableTh
                  label="Обучаемый"
                  direction={table.directionOf("student")}
                  onSort={() => table.cycleSort("student")}
                />
                {showGroup && <Table.Th w={160}>Группа</Table.Th>}
                <SortableTh
                  label="Занятие"
                  direction={table.directionOf("lesson")}
                  onSort={() => table.cycleSort("lesson")}
                />
                <Table.Th w={140}>Роль</Table.Th>
                <SortableTh
                  label="Завершена"
                  width={124}
                  direction={table.directionOf("completed")}
                  onSort={() => table.cycleSort("completed")}
                />
                <SortableTh
                  label="Балл"
                  width={84}
                  direction={table.directionOf("score")}
                  onSort={() => table.cycleSort("score")}
                />
                <Table.Th w={110}>Результат</Table.Th>
                <Table.Th w={72}>В срок</Table.Th>
                {metrics && (
                  <>
                    <Table.Th w={96} title="Карточка ДДС — от выпуска до первой записи; звонок 112 — от ответа до создания карточки">
                      Заполнение
                    </Table.Th>
                    <Table.Th w={96} title="Отклонение от норматива 3 мин до первой записи; у звонков норматива нет">
                      ± норматив
                    </Table.Th>
                    <Table.Th w={110} title="Автоматическая проверка орфографии, может ошибаться на названиях">
                      Орфографических ошибок
                    </Table.Th>
                  </>
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {pagination.rows.map((session) => {
                const assignment = assignmentOf(session);

                return (
                  <LinkRow key={session.sessionId}>
                    <Table.Td>
                      <StudentsCell session={session} groupLinkShown={showGroup} />
                    </Table.Td>
                    {showGroup && (
                      <Table.Td>
                        <GroupCell session={session} group={groupOf(session, assignment)} />
                      </Table.Td>
                    )}
                    <Table.Td>
                      <Tooltip
                        label={session.scenarioName}
                        events={tooltipEvents}
                        multiline
                        color="povDark.6"
                        radius={0}
                      >
                        <Text size="sm" tabIndex={0} truncate="end" className={classes.focusable}>
                          {session.scenarioName}
                        </Text>
                      </Tooltip>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{rolesOf(session)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" className={classes.numeric}>
                        {session.completedAt ? formatShortDateTime(session.completedAt) : "—"}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <ScoreCell session={session} />
                    </Table.Td>
                    <Table.Td>
                      <ResultCell session={session} />
                    </Table.Td>
                    <Table.Td>
                      <DeadlineCell session={session} assignment={assignment} />
                    </Table.Td>
                    {metrics && (
                      <>
                        <Table.Td className={classes.numeric}>{formatFillTime(metrics.get(session.sessionId)?.fillMs ?? null)}</Table.Td>
                        <Table.Td className={classes.numeric}>
                          {formatDeviation(metrics.get(session.sessionId)?.deviationMs ?? null)}
                        </Table.Td>
                        <Table.Td className={classes.numeric}>{metricText(metrics.get(session.sessionId)?.misspellings ?? null)}</Table.Td>
                      </>
                    )}
                  </LinkRow>
                );
              })}
            </Table.Tbody>
          </Table>
          <TablePagination
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
          />
        </Paper>
      )}
    </Stack>
  );
}
