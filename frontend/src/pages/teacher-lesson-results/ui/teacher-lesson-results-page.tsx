import { Alert, Group, Paper, Skeleton, Stack, Text, Title, Tooltip } from "@mantine/core";
import { useParams } from "react-router-dom";
import { useLessonAttempts } from "@/entities/attempt";
import { lessonStatusLabels, useLesson, useLessonSummary } from "@/entities/lesson";
import { isRequestError } from "@/shared/api";
import { criterionCodes, criterionLabels } from "@/shared/config";
import { Button, CriterionRow, ScoreBlock } from "@/shared/ui";
import { AttemptsTable } from "@/widgets/attempts-table";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });

const TeacherLessonResultsPage = () => {
  const { lessonId = "" } = useParams();
  const lesson = useLesson(lessonId);
  const summary = useLessonSummary(lessonId);
  const attempts = useLessonAttempts(lessonId);

  if (lesson.isPending) {
    return (
      <Stack gap="md">
        <Skeleton height={96} radius={2} />
        <Skeleton height={220} radius={2} />
      </Stack>
    );
  }

  if (lesson.isError) {
    const notFound = isRequestError(lesson.error) && lesson.error.status === 404;

    return (
      <Alert
        variant="outline"
        color="povDark2.6"
        title={notFound ? "Занятие не найдено" : "Не удалось загрузить занятие"}
      >
        <Stack gap="xs" align="flex-start">
          <Text size="sm">
            {notFound
              ? "Занятие удалено или идентификатор в адресе неверный."
              : lesson.error.message}
          </Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={() => lesson.refetch()}>
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  const data = lesson.data;

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
          <Stack gap={4}>
            <Title order={2} size="h4" fw={600}>
              {data.name}
            </Title>
            <Text size="sm">
              {data.group_name} · {data.participants_count} участников ·{" "}
              {lessonStatusLabels[data.status]}
            </Text>
            <Text size="xs" c="povDark2.6">
              {dateFormatter.format(new Date(data.started_at))}
              {data.finished_at ? ` — ${dateFormatter.format(new Date(data.finished_at))}` : ""} ·
              норматив обработки {data.norms.fill_seconds} с, подтверждения {data.norms.ack_seconds} с
            </Text>
            <Text size="xs" c="povDark2.6">
              Сценарии: {data.scenarios.map((scenario) => scenario.name).join(" · ")}
            </Text>
          </Stack>

          <Tooltip label="Появится вместе с ручкой экспорта, см. docs/api/lessons.md">
            <Button size="xs" variant="outline" color="povDark2.6" disabled>
              Экспорт отчёта
            </Button>
          </Tooltip>
        </Group>
      </Paper>

      {summary.isPending && <Skeleton height={220} radius={2} />}

      {summary.isError && (
        <Alert variant="outline" color="povDark2.6" title="Сводка недоступна">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{summary.error.message}</Text>
            <Button
              size="xs"
              variant="outline"
              color="povDark2.6"
              onClick={() => summary.refetch()}
            >
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {summary.isSuccess && (
        <Paper withBorder>
          <ScoreBlock
            value={Math.round(summary.data.average_total)}
            caption={`Зачёт у ${summary.data.attempts_passed} из ${summary.data.attempts_total}`}
          >
            Критических ошибок {summary.data.error_counts.critical} · значимых{" "}
            {summary.data.error_counts.significant} · незначительных{" "}
            {summary.data.error_counts.minor}
          </ScoreBlock>

          {criterionCodes.map((criterion) => (
            <CriterionRow
              key={criterion}
              code={criterion}
              label={criterionLabels[criterion]}
              weight={summary.data.criteria[criterion].weight}
              value={summary.data.criteria[criterion].value}
              points={summary.data.criteria[criterion].points}
            />
          ))}

          <Text size="xs" c="povDark2.6" p="sm">
            Средние значения по {summary.data.attempts_total} попыткам, доля зачётов{" "}
            {percent.format(summary.data.attempts_passed / summary.data.attempts_total)}.
          </Text>
        </Paper>
      )}

      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Попытки занятия
        </Title>
        <AttemptsTable
          query={attempts}
          reviewPath={(attemptId) => `/teacher/attempts/${attemptId}`}
          emptyTitle="По этому занятию завершённых попыток нет"
          emptyHint="Попытки появятся, когда участники завершат сценарии. Пока занятие идёт, следите за ним в мониторе."
        />
      </Stack>
    </Stack>
  );
};

export default TeacherLessonResultsPage;
