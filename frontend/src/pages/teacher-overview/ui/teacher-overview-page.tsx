import { useState } from "react";
import { Alert, Anchor, Group, Paper, Skeleton, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";
import { useTodayAttempts } from "@/entities/attempt";
import { lessonStatusLabels, useLessons } from "@/entities/lesson";
import { Button } from "@/shared/ui";
import { AttemptsTable } from "@/widgets/attempts-table";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const TeacherOverviewPage = () => {
  const lessons = useLessons();
  const attempts = useTodayAttempts();
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);

  const running = lessons.data?.find((lesson) => lesson.status === "RUNNING");
  const unreviewed = attempts.data?.filter((attempt) => !attempt.is_reviewed).length ?? 0;
  return (
    <Stack gap="md">
      {lessons.isPending && <Skeleton height={76} radius={2} />}

      {lessons.isError && (
        <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить занятия">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{lessons.error.message}</Text>
            <Button size="xs" variant="outline" color="povDark2.6" onClick={() => lessons.refetch()}>
              Повторить
            </Button>
          </Stack>
        </Alert>
      )}

      {lessons.isSuccess && (
        <Paper withBorder p="md">
          {running ? (
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
              <Stack gap={4}>
                <Text size="xs" c="povDark2.6">
                  Текущее занятие · {lessonStatusLabels[running.status]}
                </Text>
                <Title order={2} size="h4" fw={600}>
                  {running.name}
                </Title>
                <Text size="sm">
                  {running.group_name} · начато {dateFormatter.format(new Date(running.started_at))}
                </Text>
              </Stack>
              <Anchor
                component={Link}
                to={`/teacher/monitor/${running.lesson_id}`}
                size="sm"
                c="povDark2.6"
                underline="always"
              >
                Открыть монитор занятия
              </Anchor>
            </Group>
          ) : (
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  Активного занятия нет
                </Text>
                <Text size="sm" c="povDark2.6">
                  Монитор открывается, когда занятие идёт. Запланированные и прошедшие занятия — в
                  разделе «Занятия».
                </Text>
              </Stack>
              <Anchor component={Link} to="/teacher/lessons" size="sm" c="povDark2.6" underline="always">
                К списку занятий
              </Anchor>
            </Group>
          )}
        </Paper>
      )}

      <Stack gap="sm">
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
          <Title order={3} size="h5" fw={600}>
            Попытки за сегодня
          </Title>
          <Button
            size="xs"
            variant="outline"
            color="povDark2.6"
            disabled={unreviewed === 0}
            onClick={() => setOnlyUnreviewed((current) => !current)}
          >
            {onlyUnreviewed
              ? "Показать все попытки"
              : `Без разбора: ${unreviewed}`}
          </Button>
        </Group>

        <AttemptsTable
          query={attempts}
          filter={onlyUnreviewed ? (attempt) => !attempt.is_reviewed : undefined}
          reviewPath={(attemptId) => `/teacher/attempts/${attemptId}`}
          emptyTitle={
            onlyUnreviewed ? "Все сегодняшние попытки разобраны" : "Сегодня попыток ещё не было"
          }
          emptyHint={
            onlyUnreviewed
              ? "Снимите фильтр, чтобы увидеть остальные попытки дня."
              : "Попытки появятся, когда участники начнут проходить сценарии. Прошедшие занятия и их результаты — в разделе «Занятия»."
          }
        />
      </Stack>
    </Stack>
  );
};

export default TeacherOverviewPage;
