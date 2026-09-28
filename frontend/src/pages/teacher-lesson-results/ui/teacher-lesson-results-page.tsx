import { useState } from "react";
import { Alert, Group, Paper, Skeleton, Stack, Text, Title, Tooltip, useMantineTheme } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEmergencyServices } from "@/entities/emergency-service";
import { useTeacherSessions } from "@/entities/monitoring";
import { useSessionStore } from "@/entities/session";
import { useStudentNames } from "@/entities/student";
import {
  completedAttemptsPhrase,
  downloadLessonReport,
  interruptedAttempts,
  lessonStatusLabels,
  participantsPhrase,
  participantsWithoutAttempts,
  scoreDistribution,
  useGenerateLessonReview,
  useLessonFindings,
  useTeacherLessons,
  type Lesson,
  type LessonAiReview,
  type LessonFindingsState,
  type ReportPalette,
  type ScoreDistribution,
} from "@/features/teacher-lessons";
import type { EmergencyService, MonitoredSession } from "@/shared/api";
import { MONITOR_SOON_MINUTES, REACTION_NORMS_TEXT } from "@/shared/config";
import { formatDayMonthTime } from "@/shared/lib";
import { Button, Fact, ScoreBlock, tooltipEvents } from "@/shared/ui";
import { TeacherAttemptsTable } from "@/widgets/teacher-attempts-table";
import { LessonAiReviewBlock } from "./lesson-ai-review";
import { LessonFindings } from "./lesson-findings";
import { LessonParticipants } from "./lesson-participants";
import { LessonScenario } from "./lesson-scenario";
import { LessonScheduleActions } from "./lesson-schedule-actions";

const scoreFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const MINUTE_MS = 60 * 1000;

function monitorAvailable(lesson: Lesson, now: number): boolean {
  if (lesson.status === "RUNNING") return true;
  if (lesson.status !== "PLANNED") return false;

  return lesson.availableFrom === null || Date.parse(lesson.availableFrom) - now <= MONITOR_SOON_MINUTES * MINUTE_MS;
}

function LessonScore({ lesson, distribution }: { lesson: Lesson; distribution: ScoreDistribution | null }) {
  if (lesson.average === null) {
    return (
      <Paper withBorder p="md">
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            Средний балл: нет данных
          </Text>
          <Text size="sm" c="povDark2.6">
            У занятия нет завершённых попыток с баллом. Итог появится, когда участники завершат занятие и
            сервер выставит балл.
            {lesson.abortedCount > 0 ? ` Прерванных попыток: ${lesson.abortedCount}, в среднее они не входят.` : ""}
          </Text>
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper withBorder>
      <ScoreBlock
        value={Math.round(lesson.average.value)}
        caption={`Зачёт у ${lesson.passedCount} из ${lesson.judgedCount}`}
      >
        Среднее {completedAttemptsPhrase(lesson.average.count)}
        {lesson.abortedCount > 0 ? `; прерванных попыток: ${lesson.abortedCount}, в среднее не входят` : ""}
      </ScoreBlock>
      {distribution && (
        <Group gap="xl" p="sm">
          <Fact label="Минимум">{scoreFormatter.format(distribution.min)}</Fact>
          <Fact label="Медиана">{scoreFormatter.format(distribution.median)}</Fact>
          <Fact label="Максимум">{scoreFormatter.format(distribution.max)}</Fact>
          <Text size="xs" c="povDark2.6">
            {completedAttemptsPhrase(distribution.count)}; балл выставлен сервером
          </Text>
        </Group>
      )}
    </Paper>
  );
}

function exportBlockReason(lesson: Lesson, findings: LessonFindingsState): string | null {
  if (lesson.attempts.length === 0) return "Отчёт появится после первой попытки";
  if (findings.pending > 0) return "Дождитесь загрузки разборов: сводка ещё собирается";

  return null;
}

interface ReportButtonProps {
  lesson: Lesson;
  findings: LessonFindingsState;
  services: Map<string, EmergencyService> | undefined;
  aiReview: LessonAiReview | null;
}

function ReportButton({ lesson, findings, services, aiReview }: ReportButtonProps) {
  const theme = useMantineTheme();
  const [generating, setGenerating] = useState(false);
  const blockReason = exportBlockReason(lesson, findings);
  const blocked = blockReason !== null;

  const exportReport = async () => {
    const palette: ReportPalette = {
      text: theme.black,
      muted: theme.colors.povDark2[6],
      line: theme.colors.povLine[6],
      deviation: theme.colors.povRed[9],
    };

    setGenerating(true);
    try {
      await downloadLessonReport(
        {
          lesson,
          findings: findings.summary,
          findingsTotal: findings.total,
          services,
          aiReview,
          assessments: findings.assessments,
          generatedAt: new Date(),
        },
        palette,
      );
    } catch {
      notifications.show({
        title: "Отчёт не сформирован",
        message: "Не удалось собрать PDF. Повторите попытку.",
        color: "red",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Tooltip label={blockReason} disabled={!blocked} events={tooltipEvents} color="povDark.6" radius={0}>
      <Button
        size="xs"
        variant="outline"
        color="povDark2.6"
        loading={generating}
        data-disabled={blocked || undefined}
        aria-disabled={blocked}
        onClick={(event) => {
          if (blocked) event.preventDefault();
          else void exportReport();
        }}
      >
        Экспорт отчёта
      </Button>
    </Tooltip>
  );
}

interface LessonDetailsProps {
  lesson: Lesson;
  teacherId: string;
  sessions: UseQueryResult<MonitoredSession[], Error>;
}

function LessonDetails({ lesson, teacherId, sessions }: LessonDetailsProps) {
  const findings = useLessonFindings(lesson, teacherId);
  const aiGeneration = useGenerateLessonReview();
  const assignmentsById = new Map(lesson.assignments.map((item) => [item.id, item]));
  const services = useEmergencyServices();
  const students = useStudentNames(teacherId);
  const distribution = scoreDistribution(lesson.attempts);
  const interrupted = interruptedAttempts(lesson);
  const withoutAttempts = participantsWithoutAttempts(lesson).map(
    (id) => students.data?.get(id) ?? `обучаемый ${id.slice(0, 8)}`,
  );

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
          <Stack gap={4}>
            <Title order={2} size="h4" fw={600}>
              {lesson.scenarioName}
            </Title>
            <Text size="sm">
              {lesson.groupName ?? "Без группы"} · {participantsPhrase(lesson.participantIds.length)} ·{" "}
              {lessonStatusLabels[lesson.status]}
            </Text>
            <Text size="xs" c="povDark2.6">
              {lesson.availableFrom ? formatDayMonthTime(lesson.availableFrom) : "—"}
              {lesson.dueAt ? ` — ${formatDayMonthTime(lesson.dueAt)}` : ""} · нормативы
              реакции: {REACTION_NORMS_TEXT}
            </Text>
            {lesson.passingScore !== null && (
              <Text size="xs" c="povDark2.6">
                Зачёт — средний балл не ниже {scoreFormatter.format(lesson.passingScore)} из 100
              </Text>
            )}
          </Stack>

          <Group gap="xs">
            {monitorAvailable(lesson, Date.now()) && (
              <Button size="xs" component={Link} to={`/teacher/monitor/${lesson.id}`}>
                Монитор
              </Button>
            )}
            <LessonScheduleActions lesson={lesson} />
            <ReportButton lesson={lesson} findings={findings} services={services.data} aiReview={aiGeneration.data ?? null} />
          </Group>
        </Group>
      </Paper>

      <LessonScenario lesson={lesson} />

      <LessonParticipants lesson={lesson} names={students.data} />

      <LessonScore lesson={lesson} distribution={distribution} />

      <LessonFindings
        state={findings}
        interrupted={interrupted}
        withoutAttempts={withoutAttempts}
        services={services.data}
      />

      <LessonAiReviewBlock
        lesson={lesson}
        teacherId={teacherId}
        findings={findings}
        services={services.data}
        generation={aiGeneration}
      />

      <Stack gap="sm">
        <Title order={3} size="h5" fw={600}>
          Попытки занятия
        </Title>
        <TeacherAttemptsTable
          query={sessions}
          sessions={lesson.attempts}
          assessments={findings.assessments}
          assignments={assignmentsById}
          queryPrefix="attempts"
          showGroup={false}
          emptyTitle="По этому занятию завершённых попыток нет"
          emptyHint="Попытки появятся, когда участники завершат занятия. Пока занятие идёт, следите за ним в мониторе."
        />
      </Stack>
    </Stack>
  );
}

function LessonResults({ teacherId, lessonId }: { teacherId: string; lessonId: string }) {
  const lessons = useTeacherLessons(teacherId);
  const sessions = useTeacherSessions(teacherId, "ANY");

  if (lessons.status === "pending") {
    return (
      <Stack gap="md">
        <Skeleton height={96} radius={2} />
        <Skeleton height={220} radius={2} />
      </Stack>
    );
  }

  if (lessons.status === "error") {
    return (
      <Alert variant="outline" color="povDark2.6" title="Не удалось загрузить занятие">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">Сервер не ответил. Повторите запрос позже.</Text>
          <Button size="xs" variant="outline" color="povDark2.6" onClick={lessons.retry}>
            Повторить
          </Button>
        </Stack>
      </Alert>
    );
  }

  const lesson = lessons.lessons.find((item) => item.id === lessonId);

  if (!lesson) {
    return (
      <Alert variant="outline" color="povDark2.6" title="Занятие не найдено">
        <Text size="sm">Назначение удалено, относится к другому преподавателю или адрес неверный.</Text>
      </Alert>
    );
  }

  return <LessonDetails lesson={lesson} teacherId={teacherId} sessions={sessions} />;
}

const TeacherLessonResultsPage = () => {
  const { lessonId = "" } = useParams();
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (teacherId === null) return null;

  return <LessonResults teacherId={teacherId} lessonId={lessonId} />;
};

export default TeacherLessonResultsPage;
