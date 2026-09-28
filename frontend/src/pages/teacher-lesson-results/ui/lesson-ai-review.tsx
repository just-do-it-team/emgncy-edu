import { Anchor, Group, List, Paper, Stack, Table, Text, Title, Tooltip } from "@mantine/core";
import { Link } from "react-router-dom";
import {
  algorithmicLessonReview,
  lessonReviewRequest,
  type Lesson,
  type LessonAiReview,
  type LessonFindingsState,
  type useGenerateLessonReview,
} from "@/features/teacher-lessons";
import type { EmergencyService } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import { Button, tooltipEvents } from "@/shared/ui";
import classes from "./lesson-results.module.scss";

function blockReason(lesson: Lesson, findings: LessonFindingsState): string | null {
  if (lesson.attempts.length === 0) return "Разбор появится после первой завершённой попытки";
  if (findings.pending > 0) return "Дождитесь загрузки разборов попыток";

  return null;
}

function ReviewBody({ review }: { review: LessonAiReview }) {
  return (
    <Stack gap="sm">
      <Text size="sm">{review.summary}</Text>

      {review.typicalErrors.length > 0 && (
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            Типичные ошибки группы
          </Text>
          <Table verticalSpacing={6} layout="fixed">
            <colgroup>
              <col width={220} />
              <col />
              <col width={110} />
            </colgroup>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Ошибка</Table.Th>
                <Table.Th>Описание</Table.Th>
                <Table.Th>Обучаемых</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {review.typicalErrors.map((error) => (
                <Table.Tr key={error.title}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {error.title}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{error.description}</Text>
                  </Table.Td>
                  <Table.Td className={classes.numeric}>
                    <Text size="sm">{error.studentsCount}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      )}

      <Stack gap={4}>
        <Text size="sm" fw={600}>
          Рекомендации преподавателю
        </Text>
        <List size="sm" spacing={4}>
          {review.recommendations.map((recommendation) => (
            <List.Item key={recommendation}>{recommendation}</List.Item>
          ))}
        </List>
      </Stack>

      {review.studentNotes.length > 0 && (
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            По обучаемым
          </Text>
          {review.studentNotes.map((note) => (
            <Group key={note.sessionId} gap="xs" wrap="nowrap" align="baseline">
              <Anchor
                component={Link}
                to={`/teacher/attempts/${note.sessionId}/review`}
                size="sm"
                c="povDark2.6"
                underline="always"
              >
                {note.students}
              </Anchor>
              <Text size="sm">{note.note}</Text>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

interface LessonAiReviewProps {
  lesson: Lesson;
  teacherId: string;
  findings: LessonFindingsState;
  services: Map<string, EmergencyService> | undefined;
  generation: ReturnType<typeof useGenerateLessonReview>;
}

export function LessonAiReviewBlock({ lesson, teacherId, findings, services, generation }: LessonAiReviewProps) {
  const reason = blockReason(lesson, findings);
  const blocked = reason !== null;
  const fallback = generation.isError ? algorithmicLessonReview(findings.summary, services) : null;
  const review = generation.data ?? fallback;

  const generate = () =>
    generation.mutate({
      request: lessonReviewRequest(lesson, teacherId),
      sessions: lesson.attempts,
      basis: algorithmicLessonReview(findings.summary, services),
    });

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
          <Stack gap={2}>
            <Title order={3} size="h5" fw={600}>
              {review?.source === "algorithm" ? "Алгоритмический разбор (сервис ИИ недоступен)" : "Разбор ИИ"}
            </Title>
            {review?.source === "ai" && (
              <Text size="xs" c="povDark2.6">
                Сформировано ИИ, требует проверки преподавателем. {review.model}
                {review.generatedAt ? `, ${formatDateTime(review.generatedAt)}` : ""}
              </Text>
            )}
            {review?.source === "algorithm" && (
              <Text size="xs" c="povDark2.6">
                Посчитано по расхождениям разобранных попыток, без модели.
              </Text>
            )}
          </Stack>
          <Tooltip label={reason} disabled={!blocked} events={tooltipEvents} color="povDark.6" radius={0}>
            <Button
              size="xs"
              variant="outline"
              color="povDark2.6"
              loading={generation.isPending}
              data-disabled={blocked || undefined}
              aria-disabled={blocked}
              onClick={(event) => {
                if (blocked) event.preventDefault();
                else generate();
              }}
            >
              {review === null ? "Сформировать разбор ИИ" : "Сформировать заново"}
            </Button>
          </Tooltip>
        </Group>

        {generation.isPending && (
          <Text size="sm" role="status">
            Модель разбирает попытки занятия. Это может занять до минуты.
          </Text>
        )}

        {!generation.isPending && review === null && (
          <Text size="sm" c="povDark2.6">
            Модель соберёт типичные ошибки группы, рекомендации и заметки по обучаемым по разборам завершённых попыток.
            Итог попадёт в PDF-отчёт.
          </Text>
        )}

        {!generation.isPending && review !== null && <ReviewBody review={review} />}
      </Stack>
    </Paper>
  );
}
