import { useState } from "react";
import { Group, NumberInput, Paper, SegmentedControl, Select, Skeleton, Stack, Text, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useNavigate } from "react-router-dom";
import { assignmentWindow, assignmentWindowProblem, ScheduleFields, useAssignments } from "@/entities/assignment";
import { useEmergencyServices } from "@/entities/emergency-service";
import { useGroups } from "@/entities/group";
import { difficultyLabel } from "@/entities/scenario";
import { useTeacherStudents } from "@/entities/student";
import type { Group as LearningGroup, ScenarioListItem } from "@/shared/api";
import { focusFormField, formatDateTime, issueMessages, useLeaveGuard } from "@/shared/lib";
import { Button, Fact, IssuesList, LeaveConfirmModal } from "@/shared/ui";
import { useAssignLesson } from "../api/use-assign-lesson";
import { useScenarioRoles } from "../api/use-scenario-roles";
import {
  activeAssignmentKeys,
  effectiveCallOperators,
  emptyAssignmentDraft,
  failedRequests,
  hasAssignmentErrors,
  MAX_ATTEMPTS,
  operatorsOf,
  planRequests,
  resolveRoles,
  rowScenarioId,
  validateAssignment,
  type AssignMode,
  type AssignmentDraft,
  type Audience,
  type RequestOutcome,
} from "../model/assignment-plan";
import { AssignmentResults } from "./assignment-results";
import { ParticipantsPicker, type PickerSection } from "./participants-picker";
import { ScenarioPicker } from "./scenario-picker";

const modeOptions: { value: AssignMode; label: string }[] = [
  { value: "single", label: "Одно задание всем" },
  { value: "perStudent", label: "Разные задания" },
];

const audienceOptions: { value: Audience; label: string }[] = [
  { value: "group", label: "Группе" },
  { value: "students", label: "Обучаемым" },
];

function isMode(value: string): value is AssignMode {
  return value === "single" || value === "perStudent";
}

function isAudience(value: string): value is Audience {
  return value === "group" || value === "students";
}

function initialDraft(scenarioId: string | null, group: LearningGroup | null, studentId: string | null): AssignmentDraft {
  if (studentId !== null) {
    return {
      ...emptyAssignmentDraft,
      audience: "students",
      scenarioId,
      rows: [{ groupId: null, studentId, scenarioId: null, position: null, manual: false }],
    };
  }

  return {
    ...emptyAssignmentDraft,
    scenarioId,
    rows: (group?.students ?? []).map((student) => ({
      groupId: group?.id ?? null,
      studentId: student.id,
      scenarioId: null,
      position: null,
      manual: false,
    })),
  };
}

interface AssignLessonFormProps {
  scenarios: ScenarioListItem[];
  initialScenarioId: string | null;
  initialGroup: LearningGroup | null;
  initialStudentId: string | null;
  initialDifficulty: string | null;
  userId: string;
}

export function AssignLessonForm({
  scenarios,
  initialScenarioId,
  initialGroup,
  initialStudentId,
  initialDifficulty,
  userId,
}: AssignLessonFormProps) {
  const navigate = useNavigate();
  const groups = useGroups(userId);
  const teacherStudents = useTeacherStudents(userId);
  const assignments = useAssignments({ assignedBy: userId });
  const directory = useEmergencyServices();
  const assign = useAssignLesson();
  const [outcomes, setOutcomes] = useState<RequestOutcome[] | null>(null);
  const [shownIssues, setShownIssues] = useState(false);
  const form = useForm<AssignmentDraft>({ initialValues: initialDraft(initialScenarioId, initialGroup, initialStudentId) });
  const draft = form.values;
  const scenarioIds = [
    ...new Set(
      draft.mode === "single"
        ? draft.scenarioId === null
          ? []
          : [draft.scenarioId]
        : draft.rows.flatMap((row) => (row.scenarioId === null ? [] : [row.scenarioId])),
    ),
  ];
  const roles = useScenarioRoles(scenarioIds);
  const guard = useLeaveGuard(form.isDirty() && outcomes === null);
  const resolved = resolveRoles(draft, roles.rolesById);
  const services = [...(directory.data?.values() ?? [])].map((service) => ({ code: service.code, name: service.name }));
  const serviceName = (code: string) => services.find((service) => service.code === code)?.name ?? `служба ${code}`;
  const active = activeAssignmentKeys(assignments.data ?? []);
  const now = Date.now();
  const span = assignmentWindow(draft.availableFrom, draft.dueAt, now);
  const issues = validateAssignment(resolved, {
    rolesById: roles.rolesById,
    active,
    windowProblem: assignmentWindowProblem(draft.availableFrom, draft.dueAt, now),
    serviceName,
  });
  const errors = shownIssues ? issueMessages(issues) : {};
  const requests = planRequests(resolved, roles.rolesById, userId);
  const students = new Map([
    ...(teacherStudents.data ?? []).map((student) => [student.id, student.displayName] as const),
    ...(groups.data ?? []).flatMap((group) => group.students.map((student) => [student.id, student.displayName] as const)),
  ]);
  const groupNames = new Map((groups.data ?? []).map((group) => [group.id, group.name]));
  const audienceQuery = draft.audience === "group" ? groups : teacherStudents;
  const assignable = (teacherStudents.data ?? []).filter((student) => !student.isBlocked);
  const sections: PickerSection[] =
    draft.audience === "group"
      ? (groups.data ?? []).map((group) => ({
          groupId: group.id,
          title: `Вся группа «${group.name}»`,
          students: group.students.map((student) => ({ ...student, hint: null })),
        }))
      : assignable.length > 0
        ? [
            {
              groupId: null,
              title: null,
              students: assignable.map((student) => ({
                  id: student.id,
                  displayName: student.displayName,
                  hint: student.groupNames.length === 0 ? "без группы" : student.groupNames.join(", "),
                })),
            },
          ]
        : [];
  const singleRoles = draft.mode === "single" && draft.scenarioId !== null ? roles.rolesById.get(draft.scenarioId) : undefined;
  const callOperators = singleRoles ? effectiveCallOperators(resolved, singleRoles) : {};
  const operators = singleRoles ? operatorsOf(resolved, singleRoles.scenarioId) : [];

  const focus = (path: string) => focusFormField(path === "" ? null : form.getInputNode(path));

  const submit = () => {
    setShownIssues(true);

    if (hasAssignmentErrors(issues) || roles.pending) {
      const first = issues.find((issue) => issue.severity === "error");

      if (first) requestAnimationFrame(() => focus(first.path));
      return;
    }

    assign.mutate(
      { requests, rolesById: roles.rolesById, groupNames, serviceName },
      {
        onSuccess: (result) => {
          const [only] = result;

          if (result.length === 1 && only?.result.ok) {
            setOutcomes(result);
            navigate(`/teacher/lessons/${only.result.lessonId}`);
            return;
          }

          setOutcomes(result);
        },
      },
    );
  };

  const retry = () => {
    if (!outcomes) return;

    assign.mutate(
      { requests: failedRequests(outcomes), rolesById: roles.rolesById, groupNames, serviceName },
      {
        onSuccess: (result) => {
          const byKey = new Map(result.map((outcome) => [outcome.request.key, outcome]));

          setOutcomes(outcomes.map((outcome) => byKey.get(outcome.request.key) ?? outcome));
        },
      },
    );
  };

  if (outcomes) {
    return (
      <Stack gap="md">
        <AssignmentResults
          outcomes={outcomes}
          rolesById={roles.rolesById}
          groupName={(groupId) => (groupId === null ? "без группы" : (groupNames.get(groupId) ?? "группа"))}
          studentName={(studentId) => students.get(studentId) ?? "обучаемый"}
          retrying={assign.isPending}
          onRetry={retry}
        />
        <Group gap="xs">
          <Button
            size="sm"
            variant="outline"
            color="povDark2.6"
            onClick={() => {
              form.reset();
              setShownIssues(false);
              setOutcomes(null);
            }}
          >
            Новое назначение
          </Button>
        </Group>
      </Stack>
    );
  }

  const roleCounts = resolved.rows.reduce(
    (counts, row) => (row.position === null ? { ...counts, operators: counts.operators + 1 } : { ...counts, dds: counts.dds + 1 }),
    { operators: 0, dds: 0 },
  );
  const scenarioName = (scenarioId: string) => scenarios.find((scenario) => scenario.id === scenarioId)?.name ?? "—";
  const perStudentScenarios = new Set(resolved.rows.flatMap((row) => rowScenarioId(resolved, row) ?? []));

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={3} size="h5" fw={600}>
            Задание
          </Title>
          <SegmentedControl
            size="xs"
            radius={2}
            color="povDark2.6"
            w="fit-content"
            data={modeOptions}
            value={draft.mode}
            onChange={(value) => {
              if (isMode(value)) form.setFieldValue("mode", value);
            }}
            aria-label="Режим назначения"
          />
          {draft.mode === "single" ? (
            <ScenarioPicker
              scenarios={scenarios}
              initialDifficulty={initialDifficulty}
              value={draft.scenarioId}
              error={errors.scenarioId}
              onChange={(scenarioId) => form.setValues({ scenarioId, callOperators: {} })}
            />
          ) : (
            <Text size="sm">
              Сценарий выбирается в строке каждого обучаемого или сразу для всех выбранных. Сценарии с общим рабочим
              местом назначаются в режиме «Одно задание всем».
            </Text>
          )}
          {roles.failed && (
            <Group gap="xs">
              <Text size="sm">Состав сценария не загрузился: роли проверить нельзя.</Text>
              <Button size="xs" variant="outline" color="povDark2.6" onClick={roles.retry}>
                Повторить
              </Button>
            </Group>
          )}
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={3} size="h5" fw={600}>
            Кому
          </Title>
          <SegmentedControl
            size="xs"
            radius={2}
            color="povDark2.6"
            w="fit-content"
            data={audienceOptions}
            value={draft.audience}
            onChange={(value) => {
              if (isAudience(value)) form.setValues({ audience: value, rows: [], callOperators: {} });
            }}
            aria-label="Кому назначить"
          />
          {audienceQuery.isPending ? (
            <Stack gap="xs">
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} height={28} radius={2} />
              ))}
            </Stack>
          ) : audienceQuery.isError ? (
            <Group gap="xs">
              <Text size="sm">{draft.audience === "group" ? "Группы не загрузились." : "Список обучаемых не загрузился."}</Text>
              <Button size="xs" variant="outline" color="povDark2.6" onClick={() => audienceQuery.refetch()}>
                Повторить
              </Button>
            </Group>
          ) : (
            <ParticipantsPicker
              form={form}
              resolved={resolved}
              sections={sections}
              emptyText={
                draft.audience === "group"
                  ? "У вас нет активных групп. Создайте группу в разделе «Группы» или назначьте занятие обучаемым напрямую."
                  : "Обучаемых пока нет: в списке — те, кто состоит в ваших группах или уже получал от вас занятия. Добавьте обучаемого в группу в разделе «Группы»."
              }
              scenarios={scenarios}
              rolesById={roles.rolesById}
              active={active}
              services={services}
              errors={errors}
            />
          )}
          {singleRoles?.workspaceMode === "SHARED" && operators.length > 1 && (
            <Stack gap={6}>
              <Text size="sm" fw={500}>
                Звонки операторам 112
              </Text>
              <Group gap="sm" wrap="wrap">
                {singleRoles.callKeys.map((key, index) => (
                  <Select
                    key={key}
                    size="xs"
                    w={240}
                    label={`Звонок ${index + 1}`}
                    data={operators.map((studentId) => ({ value: studentId, label: students.get(studentId) ?? studentId }))}
                    value={callOperators[key] ?? null}
                    allowDeselect={false}
                    onChange={(value) => {
                      if (value !== null) form.setFieldValue("callOperators", { ...draft.callOperators, [key]: value });
                    }}
                  />
                ))}
              </Group>
            </Stack>
          )}
          {singleRoles?.workspaceMode === "SHARED" && (
            <Group gap="xs">
              <Button
                size="xs"
                variant="outline"
                color="povDark2.6"
                onClick={() => form.setFieldValue("rows", draft.rows.map((row) => ({ ...row, manual: false })))}
              >
                Распределить роли заново
              </Button>
              <Text size="xs" c="povDark2.6" data-path="roles" tabIndex={-1}>
                {errors.roles ?? "Сначала обязательные позиции сценария, затем оператор 112, главные службы карточек и остальные службы."}
              </Text>
            </Group>
          )}
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={3} size="h5" fw={600}>
            Когда
          </Title>
          <ScheduleFields
            value={{ availableFrom: draft.availableFrom, dueAt: draft.dueAt }}
            now={now}
            error={errors.dueAt}
            onChange={(schedule) => form.setValues(schedule)}
          />
          <Group gap="sm" align="flex-start" wrap="wrap">
            <NumberInput
              size="xs"
              w={140}
              label="Попыток"
              min={1}
              max={MAX_ATTEMPTS}
              allowDecimal={false}
              value={draft.maxAttempts}
              error={errors.maxAttempts}
              data-path="maxAttempts"
              onChange={(value) => form.setFieldValue("maxAttempts", typeof value === "number" ? value : 0)}
            />
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={3} size="h5" fw={600}>
            Итог
          </Title>
          <Group gap="xl" align="flex-start" wrap="wrap">
            <Fact label="Сценарий">
              {draft.mode === "single"
                ? draft.scenarioId === null
                  ? "—"
                  : scenarioName(draft.scenarioId)
                : `разные: ${perStudentScenarios.size}`}
            </Fact>
            {singleRoles && <Fact label="Сложность">{difficultyLabel(singleRoles.difficulty)}</Fact>}
            <Fact label="Обучаемых">{resolved.rows.length}</Fact>
            <Fact label="Занятий будет создано">{requests.length}</Fact>
            <Fact label="Выполнить с">
              {draft.availableFrom === null ? "сразу" : formatDateTime(new Date(span.start).toISOString())}
            </Fact>
            <Fact label="Срок">{formatDateTime(new Date(span.due).toISOString())}</Fact>
            <Fact label="Операторов 112">{roleCounts.operators}</Fact>
            <Fact label="Диспетчеров ДДС">{roleCounts.dds}</Fact>
          </Group>
          {requests.length > 1 && (
            <Text size="xs" c="povDark2.6">
              {draft.audience === "group"
                ? "Сервер создаёт занятие на пару «группа — сценарий»."
                : "Без группы каждому обучаемому создаётся своё занятие; общее рабочее место — одно занятие на всех."}
            </Text>
          )}
        </Stack>
      </Paper>

      {shownIssues && <IssuesList issues={issues} blockingTitle="Нельзя назначить" onFocus={focus} />}

      <Group justify="flex-end" gap="xs">
        <Button size="sm" loading={assign.isPending} disabled={roles.pending && scenarioIds.length > 0} onClick={submit}>
          Назначить
        </Button>
      </Group>

      <LeaveConfirmModal opened={guard.pendingPath !== null} onStay={guard.stay} onLeave={guard.leave} />
    </Stack>
  );
}
