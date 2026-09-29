import type { KeyboardEvent, MouseEvent } from "react";
import { Anchor, Group, Paper, Table, Text, Tooltip } from "@mantine/core";
import { Link } from "react-router-dom";
import { actionTypeLabel, responseStatusLabel } from "@/entities/expert-review";
import { isReviewable, reviewAccessHint } from "@/entities/monitoring";
import type { EmergencyService, TrainingActionDto } from "@/shared/api";
import { formatClockTime } from "@/shared/lib";
import { tooltipEvents } from "@/shared/ui";
import { elementLabels, type ParticipantRow, type RowStatus, type TimerLevel, type TimerPhase } from "@/entities/monitoring";
import { formatAgo, formatDuration } from "../model/format";
import { positionText } from "../model/position";
import { AbortSessionButton } from "./abort-session";
import classes from "./lesson-monitor.module.scss";

const LOG_LIMIT = 12;
const scoreFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const TABLE_MIN_WIDTH = 820;
const COLUMNS = 7;
const INTERACTIVE_SELECTOR = "a, button, input, textarea";

const statusLabels: Record<RowStatus, string> = {
  running: "Идёт",
  completed: "Завершена",
  aborted: "Прервана",
  not_started: "Не начата",
};

const timerLevelLabels: Record<TimerLevel, string | null> = {
  ok: null,
  near: "близко",
  overdue: "превышен",
  none: null,
};

const phaseLabels: Record<TimerPhase, string> = {
  open: "до открытия",
  first_entry: "до первой записи",
};

const timerClass: Partial<Record<TimerLevel, string>> = {
  near: classes.timerNear,
  overdue: classes.timerOverdue,
};

const deadlineLabels: Record<string, string> = {
  CARD_OPEN_DEADLINE_MISSED: "сервер отметил просрочку раскрытия",
  CARD_DECISION_DEADLINE_MISSED: "сервер отметил просрочку решения",
};

function logText(action: TrainingActionDto): string {
  const label = deadlineLabels[action.action_type] ?? actionTypeLabel(action.action_type) ?? "служебное действие";
  const status = typeof action.details.status === "string" ? responseStatusLabel(action.details.status) : null;
  const comment = typeof action.details.comment === "string" && action.details.comment.trim() ? action.details.comment.trim() : null;
  const rejected = action.result === "SUCCESS" ? null : "отклонено сервером";

  return [label, status, comment ? `«${comment}»` : null, rejected].filter(Boolean).join(" — ");
}

function ActionLog({ row, actions }: { row: ParticipantRow; actions: TrainingActionDto[] | undefined }) {
  if (actions === undefined) {
    return (
      <Text size="sm" p="sm" c="povDark2.6">
        Журнал загружается…
      </Text>
    );
  }

  const labels = elementLabels(actions);
  const relevant = actions
    .filter((action) => action.actor_user_id === row.userId || action.actor_user_id === null)
    .slice(-LOG_LIMIT)
    .reverse();

  if (relevant.length === 0) {
    return (
      <Text size="sm" p="sm" c="povDark2.6">
        Действий пока нет.
      </Text>
    );
  }

  return (
    <div>
      {relevant.map((action) => {
        const element = labels.get(action.incident_card_id ?? action.entity_id ?? "") ?? "—";

        return (
          <div key={action.id} className={classes.logLine}>
            <span className={classes.logTime}>{formatClockTime(action.occurred_at)}</span>
            <span>{element}</span>
            <span>{logText(action)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CurrentElementCell({ row }: { row: ParticipantRow }) {
  const { timer } = row;

  if (timer === null) return <Text size="sm">—</Text>;

  const limit = timer.limitMs === null ? "" : ` / ${formatDuration(timer.limitMs)}`;
  const note = [timer.phase === null ? "без норматива" : phaseLabels[timer.phase], timerLevelLabels[timer.level]]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={`${classes.timer} ${timerClass[timer.level] ?? ""}`}>
      <Text size="sm" fw={timer.level === "overdue" ? 600 : undefined}>
        {timer.elementLabel}: {formatDuration(timer.elapsedMs)}
        {limit}
      </Text>
      <Text size="xs" c="povDark2.6">
        {note}
      </Text>
    </div>
  );
}

interface ParticipantsTableProps {
  rows: ParticipantRow[];
  now: number;
  teacherId: string;
  sharedSessions: ReadonlySet<string>;
  names: Map<string, string>;
  services: Map<string, EmergencyService> | undefined;
  actionsBySession: Map<string, TrainingActionDto[]>;
  expanded: string | null;
  highlighted: string | null;
  onToggle: (userId: string) => void;
}

export function ParticipantsTable({
  rows,
  now,
  teacherId,
  sharedSessions,
  names,
  services,
  actionsBySession,
  expanded,
  highlighted,
  onToggle,
}: ParticipantsTableProps) {
  const clickToggle = (event: MouseEvent<HTMLTableRowElement>, userId: string) => {
    const target = event.target;

    if (!(target instanceof Element) || !event.currentTarget.contains(target) || target.closest(INTERACTIVE_SELECTOR)) return;
    onToggle(userId);
  };

  const keyToggle = (event: KeyboardEvent<HTMLTableRowElement>, userId: string) => {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onToggle(userId);
  };

  return (
    <Paper withBorder>
      <Table.ScrollContainer minWidth={TABLE_MIN_WIDTH} type="native">
        <Table verticalSpacing="xs" highlightOnHover layout="fixed">
          <colgroup>
            <col />
            <col width={92} />
            <col width={184} />
            <col width={76} />
            <col width={100} />
            <col width={84} />
            <col width={136} />
          </colgroup>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Обучаемый</Table.Th>
              <Table.Th>Статус</Table.Th>
              <Table.Th>Текущий элемент</Table.Th>
              <Table.Th>Действий</Table.Th>
              <Table.Th>Последнее</Table.Th>
              <Table.Th>Просрочек</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => {
              const open = expanded === row.userId;
              const session = row.session;
              const shared = session !== null && sharedSessions.has(session.sessionId);
              const sessionNames = session?.participants.map((item) => names.get(item.userId) ?? item.displayName) ?? [];

              return [
                <Table.Tr
                  key={row.userId}
                  id={`monitor-row-${row.userId}`}
                  className={`${classes.row} ${highlighted === row.userId ? classes.rowHighlighted : ""}`}
                  tabIndex={0}
                  aria-expanded={open}
                  onClick={(event) => clickToggle(event, row.userId)}
                  onKeyDown={(event) => keyToggle(event, row.userId)}
                >
                  <Table.Td>
                    <Text size="sm" fw={500} lineClamp={2}>
                      {row.name}
                    </Text>
                    <Text size="xs" c="povDark2.6" lineClamp={2}>
                      {positionText(row, services)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{statusLabels[row.status]}</Text>
                    {session !== null && session.score !== null && row.status !== "running" && (
                      <Text size="xs" c="povDark2.6">
                        {`балл ${scoreFormatter.format(session.score)}${session.teacherAssessed ? ", оценка преподавателя" : ""}`}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <CurrentElementCell row={row} />
                  </Table.Td>
                  <Table.Td className={classes.numeric}>
                    <Text size="sm">{row.status === "not_started" ? "—" : row.actionCount}</Text>
                  </Table.Td>
                  <Table.Td className={classes.numeric}>
                    <Text size="sm">{row.lastActionAt === null ? "—" : formatAgo(now - row.lastActionAt)}</Text>
                  </Table.Td>
                  <Table.Td className={classes.numeric}>
                    <Text size="sm" fw={row.violations > 0 ? 600 : undefined}>
                      {row.status === "not_started" ? "—" : row.violations}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      {session !== null && isReviewable(session.status) && (
                        <Tooltip
                          label={reviewAccessHint(session.status)}
                          disabled={reviewAccessHint(session.status) === null}
                          events={tooltipEvents}
                          multiline
                          w={260}
                          color="povDark.6"
                          radius={0}
                        >
                          <Anchor
                            component={Link}
                            to={`/teacher/attempts/${session.sessionId}/review`}
                            className={classes.numeric}
                            size="sm"
                            c="povDark2.6"
                            underline="always"
                          >
                            Открыть разбор
                          </Anchor>
                        </Tooltip>
                      )}
                      {session !== null && row.status === "running" && (
                        <AbortSessionButton
                          sessionId={session.sessionId}
                          teacherId={teacherId}
                          shared={shared}
                          participantNames={sessionNames}
                        />
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>,
                open && (
                  <Table.Tr key={`${row.userId}:log`}>
                    <Table.Td colSpan={COLUMNS} className={classes.expandedCell}>
                      {session === null ? (
                        <Text size="sm" p="sm" c="povDark2.6">
                          Обучаемый ещё не начал занятие.
                        </Text>
                      ) : (
                        <ActionLog row={row} actions={actionsBySession.get(session.sessionId)} />
                      )}
                    </Table.Td>
                  </Table.Tr>
                ),
              ];
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}
