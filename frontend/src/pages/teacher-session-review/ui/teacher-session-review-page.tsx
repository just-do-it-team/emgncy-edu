import { useState } from "react";
import { Alert, Anchor, SegmentedControl, Skeleton, Stack, Text } from "@mantine/core";
import { isAxiosError } from "axios";
import { Link, useParams } from "react-router-dom";
import { useEmergencyServices } from "@/entities/emergency-service";
import { useExpertReviewContext, useReviewAssignment } from "@/entities/expert-review";
import { useSessionStore } from "@/entities/session";
import { useStudentNames } from "@/entities/student";
import type { ExpertReviewContext, ReviewAssignment } from "@/shared/api";
import { elementActions, formatOffset, offsetFrom, reviewElements } from "../model/replay";
import { participantRoleLabels } from "../model/review-labels";
import { CallElementReview, CardElementReview } from "./element-review";
import type { RoleState } from "./review-findings";
import classes from "./session-review.module.scss";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const scoreFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

function RequestState({ title, children }: { title: string; children: string }) {
  return (
    <Alert variant="outline" color="povDark2.6" title={title}>
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{children}</Text>
        <Anchor component={Link} to="/teacher/students" size="sm" c="povDark2.6" underline="always">
          К результатам обучающихся
        </Anchor>
      </Stack>
    </Alert>
  );
}

function Cell({ label, children }: { label: string; children: string }) {
  return (
    <div className={classes.cell}>
      <span className={classes.cellLabel}>{label}</span>
      <span className={classes.cellValue}>{children}</span>
    </div>
  );
}

function contextProblem(error: Error): { title: string; text: string } {
  const status = isAxiosError(error) ? error.response?.status : undefined;

  if (status === 404) {
    return {
      title: "Попытка не найдена",
      text: "Сессии с таким идентификатором нет, либо она относится к назначению другого преподавателя.",
    };
  }
  if (status === 403) {
    return { title: "Нет доступа", text: "Разбор этой попытки доступен только назначившему её преподавателю." };
  }
  if (status === 409) {
    return {
      title: "Попытка не завершена",
      text: "Разбор открывается для завершённых попыток. Эта попытка ещё идёт или была прервана.",
    };
  }
  if (status === 422) {
    return {
      title: "Попытка недоступна",
      text: "Попытка назначена другим преподавателем, либо идентификатор в адресе неверный.",
    };
  }

  return {
    title: "Не удалось загрузить разбор",
    text: "Сервер не ответил. Повторите попытку позже или откройте разбор из обзора.",
  };
}

function roleStateOf(
  context: ExpertReviewContext,
  assignment: ReturnType<typeof useReviewAssignment>,
): RoleState {
  if (assignment.isPending) return { status: "pending" };
  if (assignment.isError) {
    return {
      status: "error",
      message: "Не удалось получить назначение, роль участника неизвестна.",
      retry: () => void assignment.refetch(),
    };
  }

  const roles = new Set(
    assignment.data.participants
      .filter((participant) => context.participantIds.includes(participant.userId))
      .map((participant) => participant.role),
  );
  const [role] = roles;

  if (roles.size === 1 && role !== undefined) return { status: "ready", role };

  return {
    status: "error",
    message:
      roles.size === 0
        ? "Участник попытки не найден в назначении, роль неизвестна."
        : "В попытке участники с разными ролями: применимость критериев для общей оценки не определена.",
    retry: () => void assignment.refetch(),
  };
}

function participantRole(context: ExpertReviewContext, assignment: ReviewAssignment | undefined): string {
  const roles = new Set(
    (assignment?.participants ?? [])
      .filter((participant) => context.participantIds.includes(participant.userId))
      .map((participant) => participantRoleLabels[participant.role]),
  );

  return roles.size === 0 ? "—" : [...roles].join(", ");
}

function discrepancyCount(context: ExpertReviewContext): number {
  return [...context.incomingCalls, ...context.cards].reduce(
    (total, element) => total + (element.automaticResult?.discrepancies.length ?? 0),
    0,
  );
}

function passedLabel(passed: boolean | null): string {
  if (passed === null) return "—";

  return passed ? "зачтено" : "не зачтено";
}

interface LoadedReviewProps {
  context: ExpertReviewContext;
  teacherId: string;
}

function LoadedReview({ context, teacherId }: LoadedReviewProps) {
  const assignment = useReviewAssignment(context.session.assignmentId);
  const students = useStudentNames(teacherId);
  const services = useEmergencyServices();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { session } = context;
  const elements = reviewElements(context);
  const element = elements.find((item) => item.key === selectedKey) ?? elements[0];
  const names = context.participantIds.map(
    (id) => students.data?.get(id) ?? (students.isPending ? "…" : `обучающийся ${id.slice(0, 8)}`),
  );
  const scenarioName =
    assignment.data?.scenarioName ??
    (typeof context.scenarioSnapshot.name === "string" ? context.scenarioSnapshot.name : "—");
  const roleState = roleStateOf(context, assignment);
  const elementProps = element && {
    originAt: element.originAt,
    actions: elementActions(element, context.actions),
    roleState,
    services: services.data,
  };

  return (
    <div className={classes.screen}>
      <div className={classes.meta}>
        <Cell label={names.length > 1 ? "Обучающиеся" : "Обучающийся"}>{names.join(", ") || "—"}</Cell>
        <Cell label="Роль">{participantRole(context, assignment.data)}</Cell>
        <Cell label="Сценарий">{scenarioName}</Cell>
        <Cell label="Дата">{dateFormatter.format(new Date(session.startedAt))}</Cell>
        <Cell label="Длительность">
          {session.completedAt === null
            ? "попытка не завершена"
            : formatOffset(offsetFrom(session.startedAt, session.completedAt))}
        </Cell>
        <Cell label="Попытка">{String(session.attemptNumber)}</Cell>
      </div>

      <div className={classes.summary}>
        <Cell label="Балл">{session.score === null ? "не рассчитан" : scoreFormatter.format(session.score)}</Cell>
        <Cell label="Зачёт">{passedLabel(session.passed)}</Cell>
        <Cell label="Расхождений">{String(discrepancyCount(context))}</Cell>
        {session.expertAssessment && (
          <Cell label="Оценка преподавателя">
            {`${scoreFormatter.format(session.expertAssessment.score)}, ${passedLabel(session.expertAssessment.passed)}`}
          </Cell>
        )}
        {elements.length > 1 && element && (
          <SegmentedControl
            className={classes.summarySwitch}
            size="xs"
            radius={2}
            value={element.key}
            onChange={setSelectedKey}
            data={elements.map((item) => ({ value: item.key, label: item.label }))}
            aria-label="Элемент попытки"
          />
        )}
      </div>

      {element === undefined || elementProps === undefined ? (
        <div className={classes.state}>
          В попытке нет ни звонков, ни карточек сценария — разбирать нечего.
          <div className={classes.stateHint}>
            Проверьте назначение сценария или вернитесь к{" "}
            <Anchor component={Link} to="/teacher" size="xs" c="povDark.6" underline="always">
              обзору
            </Anchor>
            .
          </div>
        </div>
      ) : element.kind === "call" ? (
        <CallElementReview key={element.key} call={element.call} {...elementProps} />
      ) : (
        <CardElementReview key={element.key} card={element.card} {...elementProps} />
      )}
    </div>
  );
}

interface ReviewScreenProps {
  sessionId: string;
  teacherId: string;
}

function ReviewScreen({ sessionId, teacherId }: ReviewScreenProps) {
  const context = useExpertReviewContext(sessionId, teacherId);

  if (context.isPending) {
    return (
      <div className={classes.screen}>
        <div className={classes.meta}>
          <Skeleton height={34} width={560} radius={0} />
        </div>
        <div className={classes.summary}>
          <Skeleton height={34} width={360} radius={0} />
        </div>
        <Skeleton height="100%" radius={0} />
      </div>
    );
  }

  if (context.isError) {
    const problem = contextProblem(context.error);

    return <RequestState title={problem.title}>{problem.text}</RequestState>;
  }

  return <LoadedReview context={context.data} teacherId={teacherId} />;
}

const TeacherSessionReviewPage = () => {
  const { sessionId } = useParams();
  const teacherId = useSessionStore((state) => state.profile?.userId ?? null);

  if (!sessionId || teacherId === null) {
    return (
      <RequestState title="Попытка не указана">
        В адресе нет идентификатора попытки. Откройте разбор из обзора преподавателя.
      </RequestState>
    );
  }

  return <ReviewScreen sessionId={sessionId} teacherId={teacherId} />;
};

export default TeacherSessionReviewPage;
