import { useState } from "react";
import { Alert, Anchor, SegmentedControl, Skeleton, Stack, Text } from "@mantine/core";
import { isAxiosError } from "axios";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useEmergencyServices } from "@/entities/emergency-service";
import { discrepancyLabel, useExpertReviewContext, useReviewAssignment } from "@/entities/expert-review";
import { useSessionStore } from "@/entities/session";
import { useStudentNames } from "@/entities/student";
import type { ExpertReviewContext, ReviewAssignment } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import { elementActions, formatOffset, offsetFrom, reviewElements } from "../model/replay";
import { abortReasonText, type AbortActor } from "../model/review-labels";
import { ABORTED_SESSION_STATUS, participantRoleLabels } from "@/entities/monitoring";
import { CallElementReview, CardElementReview, OutgoingCallElementReview } from "./element-review";
import { ExpertAssessmentCell } from "./expert-assessment";
import type { FindingDismissal, RoleState } from "./review-findings";
import classes from "./session-review.module.scss";

const scoreFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

function RequestState({ title, children }: { title: string; children: string }) {
  return (
    <Alert variant="outline" color="povDark2.6" title={title}>
      <Stack gap="xs" align="flex-start">
        <Text size="sm">{children}</Text>
        <Anchor component={Link} to="/teacher/students" size="sm" c="povDark2.6" underline="always">
          К результатам обучаемых
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
      title: "Попытка ещё идёт",
      text: "Разбор открывается, когда попытка завершена или прервана.",
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
  participantId: string | null,
): RoleState {
  if (assignment.isPending) return { status: "pending" };
  if (assignment.isError) {
    return {
      status: "error",
      message: "Не удалось получить назначение, роль участника неизвестна.",
      retry: () => void assignment.refetch(),
    };
  }

  const scope = participantId === null ? context.participantIds : [participantId];
  const roles = new Set(
    assignment.data.participants
      .filter((participant) => scope.includes(participant.userId))
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

const WHOLE_GROUP = "all";

function abortActorOf(context: ExpertReviewContext): AbortActor {
  const aborted = context.actions.find((action) => action.kind === "session" && action.stage === "aborted");
  const actor = aborted?.actorUserId ?? null;

  if (actor === null) return "unknown";

  return context.participantIds.includes(actor) ? "participant" : "teacher";
}
interface LoadedReviewProps {
  context: ExpertReviewContext;
  teacherId: string;
  aborted: boolean;
}

function LoadedReview({ context, teacherId, aborted }: LoadedReviewProps) {
  const assignment = useReviewAssignment(context.session.assignmentId);
  const students = useStudentNames(teacherId);
  const services = useEmergencyServices();
  const [dismissed, setDismissed] = useState<ReadonlyMap<string, string>>(new Map());
  const [searchParams] = useSearchParams();
  const linkedElement = searchParams.get("element");
  const [selectedKey, setSelectedKey] = useState<string | null>(linkedElement);
  const [participantId, setParticipantId] = useState<string | null>(() => {
    const linked = searchParams.get("participant");

    return linked !== null && context.participantIds.length > 1 && context.participantIds.includes(linked)
      ? linked
      : null;
  });

  const { session } = context;
  const evaluated = [...context.cards, ...context.incomingCalls].some((element) => element.automaticResult !== null);
  const callOperators = new Map(
    context.actions.flatMap((action) =>
      action.kind === "call" && action.stage === "answered" && action.entityId !== null
        ? [[action.entityId, action.actorUserId] as const]
        : [],
    ),
  );
  const elements = reviewElements(context).filter(
    (item) =>
      participantId === null ||
      item.kind === "card" ||
      (item.kind === "outgoing"
        ? item.call.operatorUserId === null || item.call.operatorUserId === participantId
        : callOperators.get(item.call.trainingCallId) === participantId),
  );
  const element = elements.find((item) => item.key === selectedKey) ?? elements[0];
  const names = context.participantIds.map(
    (id) => students.data?.get(id) ?? (students.isPending ? "…" : `обучаемый ${id.slice(0, 8)}`),
  );
  const scenarioName =
    assignment.data?.scenarioName ??
    (typeof context.scenarioSnapshot.name === "string" ? context.scenarioSnapshot.name : "—");
  const roleState = roleStateOf(context, assignment, participantId);
  const dismissal: FindingDismissal | null =
    aborted || element === undefined
      ? null
      : {
          isDismissed: (path) => dismissed.has(`${element.key}::${path}`),
          onChange: (path, value) =>
            setDismissed((current) => {
              const next = new Map(current);
              const key = `${element.key}::${path}`;

              if (value) next.set(key, `${element.label}: ${discrepancyLabel(path, services.data)}`);
              else next.delete(key);

              return next;
            }),
        };
  const elementProps = element && {
    dismissal,
    originAt: element.originAt,
    actions: elementActions(element, context.actions).filter(
      (action) => participantId === null || action.actorUserId === null || action.actorUserId === participantId,
    ),
    roleState,
    services: services.data,
    limitedNote: aborted
      ? evaluated
        ? "Попытка прервана: балл и расхождения — по состоянию на момент прерывания."
        : "Попытка прервана до оценки: сервер не выставлял по ней расхождения с эталоном."
      : null,
    scopeNote:
      participantId === null
        ? null
        : "Расхождения посчитаны по попытке группы, сервер не привязывает их к участнику.",
  };

  return (
    <div className={classes.screen}>
      <div className={classes.meta}>
        <Cell label={names.length > 1 ? "Обучаемые" : "Обучаемый"}>{names.join(", ") || "—"}</Cell>
        <Cell label="Роль">{participantRole(context, assignment.data)}</Cell>
        <Cell label="Занятие">{scenarioName}</Cell>
        <Cell label="Дата">{formatDateTime(session.startedAt)}</Cell>
        <Cell label="Длительность">
          {session.completedAt === null
            ? "попытка не завершена"
            : formatOffset(offsetFrom(session.startedAt, session.completedAt))}
        </Cell>
        <Cell label="Попытка">{String(session.attemptNumber)}</Cell>
      </div>

      <div className={classes.summary}>
        <Cell label="Балл">
          {session.score === null
            ? "не рассчитан"
            : `${scoreFormatter.format(session.score)}${aborted ? " на момент прерывания" : ""}`}
        </Cell>
        <Cell label="Зачёт">{aborted ? "попытка прервана" : passedLabel(session.passed)}</Cell>
        {session.passingScore !== null && (
          <Cell label="Зачтено при балле">{`от ${scoreFormatter.format(session.passingScore)}`}</Cell>
        )}
        <Cell label="Расхождений">
          {aborted && !evaluated
            ? "не считались"
            : `${discrepancyCount(context)}${aborted ? " на момент прерывания" : ""}`}
        </Cell>
        {aborted && (
          <Cell label="Причина прерывания">{abortReasonText(session.abortReason, abortActorOf(context))}</Cell>
        )}
        <ExpertAssessmentCell session={session} teacherId={teacherId} aborted={aborted} dismissed={[...dismissed.values()]} />
        {context.participantIds.length > 1 && (
          <SegmentedControl
            size="xs"
            radius={2}
            value={participantId ?? WHOLE_GROUP}
            onChange={(value) => setParticipantId(value === WHOLE_GROUP ? null : value)}
            data={[
              { value: WHOLE_GROUP, label: "Вся группа" },
              ...context.participantIds.map((id, index) => ({ value: id, label: names[index] ?? id })),
            ]}
            aria-label="Участник попытки"
          />
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
          {participantId === null
            ? "В попытке нет ни звонков, ни карточек занятия — разбирать нечего."
            : "У выбранного участника в этой попытке нет принятых звонков и карточек. Выберите «Вся группа»."}
          <div className={classes.stateHint}>
            Проверьте назначение занятия или вернитесь к{" "}
            <Anchor component={Link} to="/teacher" size="xs" c="povDark.6" underline="always">
              обзору
            </Anchor>
            .
          </div>
        </div>
      ) : element.kind === "call" ? (
        <CallElementReview
          key={element.key}
          call={element.call}
          focusPath={element.key === linkedElement ? searchParams.get("focus") : null}
          {...elementProps}
        />
      ) : element.kind === "outgoing" ? (
        <OutgoingCallElementReview
          key={element.key}
          call={element.call}
          focusPath={element.key === linkedElement ? searchParams.get("focus") : null}
          {...elementProps}
        />
      ) : (
        <CardElementReview
          key={element.key}
          card={element.card}
          focusPath={element.key === linkedElement ? searchParams.get("focus") : null}
          {...elementProps}
        />
      )}
    </div>
  );
}

interface ReviewScreenProps {
  sessionId: string;
  teacherId: string;
}

function ReviewSkeleton() {
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

function ReviewScreen({ sessionId, teacherId }: ReviewScreenProps) {
  const context = useExpertReviewContext(sessionId, teacherId);

  if (context.isPending) return <ReviewSkeleton />;

  if (context.isError) {
    const problem = contextProblem(context.error);

    return <RequestState title={problem.title}>{problem.text}</RequestState>;
  }

  return (
    <LoadedReview
      context={context.data}
      teacherId={teacherId}
      aborted={context.data.session.status === ABORTED_SESSION_STATUS}
    />
  );
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
