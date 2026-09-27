import { Alert, Anchor, Skeleton, Stack, Table, Text, Tooltip } from "@mantine/core";
import { Link, useNavigate } from "react-router-dom";
import { useTrainingHistory } from "@/entities/student";
import type { TrainingHistoryItem } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import {
  ABORTED_SESSION_STATUS,
  abortedScoreHint,
  isReviewable,
  reviewAccessHint,
  sessionStatusLabels,
} from "@/entities/monitoring";
import { Button, TablePagination, tooltipEvents, usePagination } from "@/shared/ui";
import classes from "./student-results.module.scss";

const scoreFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

function reviewPath(sessionId: string): string {
  return `/teacher/attempts/${sessionId}/review`;
}

function duration(item: TrainingHistoryItem): string {
  if (item.completedAt === null) return "—";

  const totalSeconds = Math.max(
    0,
    Math.round((Date.parse(item.completedAt) - Date.parse(item.startedAt)) / 1000),
  );

  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function passedLabel(passed: boolean | null): string {
  if (passed === null) return "—";

  return passed ? "зачтено" : "не зачтено";
}

function StatusText({ status }: { status: string }) {
  const label = sessionStatusLabels[status] ?? status;
  const hint = reviewAccessHint(status);

  if (hint === null) return <Text size="sm">{label}</Text>;

  return (
    <Tooltip label={hint} events={tooltipEvents} color="povDark.6" radius={0}>
      <Text size="sm" tabIndex={0} className={classes.focusable}>
        {label}
      </Text>
    </Tooltip>
  );
}

function AttemptRow({ item }: { item: TrainingHistoryItem }) {
  const navigate = useNavigate();
  const reviewable = isReviewable(item.status);

  return (
    <Table.Tr
      className={reviewable ? classes.reviewableRow : undefined}
      onClick={reviewable ? () => navigate(reviewPath(item.sessionId)) : undefined}
    >
      <Table.Td>
        {reviewable ? (
          <Anchor
            component={Link}
            to={reviewPath(item.sessionId)}
            size="sm"
            c="povDark.6"
            underline="always"
            onClick={(event) => event.stopPropagation()}
          >
            <Text span size="sm" lineClamp={2}>
              {item.scenarioName || "Занятие без названия"}
            </Text>
          </Anchor>
        ) : (
          <Text size="sm" lineClamp={2}>
            {item.scenarioName || "Занятие без названия"}
          </Text>
        )}
        {item.groupName && (
          <Text size="xs" className={classes.muted}>
            {item.groupName}
          </Text>
        )}
      </Table.Td>
      <Table.Td className={classes.numeric}>
        <Text size="sm">{formatDateTime(item.startedAt)}</Text>
      </Table.Td>
      <Table.Td className={classes.numeric}>
        <Text size="sm">{duration(item)}</Text>
      </Table.Td>
      <Table.Td className={classes.numeric}>
        {item.status === ABORTED_SESSION_STATUS && item.score !== null ? (
          <Tooltip label={abortedScoreHint} events={tooltipEvents} color="povDark.6" radius={0}>
            <Text size="sm" tabIndex={0} className={classes.muted}>
              {scoreFormatter.format(item.score)}
            </Text>
          </Tooltip>
        ) : (
          <Text size="sm" fw={500}>
            {item.score === null ? "—" : scoreFormatter.format(item.score)}
          </Text>
        )}
        {item.scoredByTeacher && (
          <Text size="xs" className={classes.muted}>
            оценка преподавателя
          </Text>
        )}
      </Table.Td>
      <Table.Td>
        <Text size="sm" fw={item.passed === false ? 500 : 400}>
          {passedLabel(item.passed)}
        </Text>
      </Table.Td>
      <Table.Td className={classes.numeric}>
        <Text size="sm">{item.attemptNumber}</Text>
      </Table.Td>
      <Table.Td>
        <StatusText status={item.status} />
      </Table.Td>
    </Table.Tr>
  );
}

interface AttemptsPanelProps {
  studentId: string;
  teacherId: string;
}

export function AttemptsPanel({ studentId, teacherId }: AttemptsPanelProps) {
  const history = useTrainingHistory(studentId, teacherId);
  const pagination = usePagination(history.data ?? []);

  if (history.isPending) {
    return (
      <Stack gap="xs" p="sm">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} height={28} radius={0} />
        ))}
      </Stack>
    );
  }

  if (history.isError) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить попытки" m="sm">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">Сервер не ответил. Повторите запрос или выберите другого обучаемого.</Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={() => history.refetch()}>
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  if (history.data.length === 0) {
    return (
      <div className={classes.state}>
        У обучаемого нет попыток по вашим назначениям.
        <div className={classes.stateHint}>
          Назначьте сценарий в разделе{" "}
          <Anchor component={Link} to="/teacher/lessons" size="xs" c="povDark.6" underline="always">
            «Занятия»
          </Anchor>
          ; попытки появятся здесь, когда обучаемый их начнёт.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={classes.tableScroll}>
        <Table verticalSpacing="xs" highlightOnHover layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Занятие</Table.Th>
              <Table.Th w={140}>Дата</Table.Th>
              <Table.Th w={104}>Длительность</Table.Th>
              <Table.Th w={112}>Балл</Table.Th>
              <Table.Th w={100}>Зачёт</Table.Th>
              <Table.Th w={76}>Попытка</Table.Th>
              <Table.Th w={150}>Статус</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {pagination.rows.map((item) => (
              <AttemptRow key={item.sessionId} item={item} />
            ))}
          </Table.Tbody>
        </Table>
      </div>
      <TablePagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={pagination.onPageChange}
        onPageSizeChange={pagination.onPageSizeChange}
      />
    </>
  );
}
