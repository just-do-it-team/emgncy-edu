import type { FormIssue } from "@/shared/lib";
import type {
  GroupAssignmentCreateDto,
  ScenarioDetail,
  ScenarioWorkspaceMode,
  TeacherAssignment,
} from "@/shared/api";

export interface ScenarioRoles {
  scenarioId: string;
  name: string;
  revision: number;
  difficulty: number;
  workspaceMode: ScenarioWorkspaceMode;
  minParticipants: number;
  maxParticipants: number;
  callKeys: string[];
  cardCount: number;
  procedural: boolean;
  mainServices: string[];
  ddsServices: string[];
}

export type AssignMode = "single" | "perStudent";

export interface AssignmentRow {
  groupId: string;
  studentId: string;
  scenarioId: string | null;
  position: string | null;
  manual: boolean;
}

export interface AssignmentDraft {
  mode: AssignMode;
  scenarioId: string | null;
  rows: AssignmentRow[];
  availableFrom: string | null;
  dueAt: string | null;
  maxAttempts: number;
  callOperators: Record<string, string>;
}

export type AssignmentIssue = FormIssue;

export interface PlannedRequest {
  key: string;
  groupId: string;
  scenarioId: string;
  studentIds: string[];
  body: GroupAssignmentCreateDto;
}

export type RequestResult = { ok: true; lessonId: string } | { ok: false; message: string };

export interface RequestOutcome {
  request: PlannedRequest;
  result: RequestResult;
}

export const MAX_ATTEMPTS = 100;
const MAX_PARTICIPANTS = 100;
const ACTIVE_STATUSES = new Set(["ASSIGNED", "RUNNING"]);

export const emptyAssignmentDraft: AssignmentDraft = {
  mode: "single",
  scenarioId: null,
  rows: [],
  availableFrom: null,
  dueAt: null,
  maxAttempts: 1,
  callOperators: {},
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function scenarioRolesOf(detail: ScenarioDetail): ScenarioRoles {
  const cards = detail.items.filter((item) => item.itemType === "INCIDENT_CARD");
  const mainServices = unique(cards.flatMap((item) => (item.mainService ? [item.mainService.code] : [])));

  return {
    scenarioId: detail.id,
    name: detail.name,
    revision: detail.revision,
    difficulty: detail.difficulty,
    workspaceMode: detail.workspaceMode,
    minParticipants: detail.minParticipants,
    maxParticipants: detail.maxParticipants,
    callKeys: detail.items.filter((item) => item.itemType === "INCOMING_CALL").map((item) => item.key),
    cardCount: cards.length,
    procedural: detail.procedural !== null,
    mainServices,
    ddsServices: unique([...mainServices, ...cards.flatMap((item) => item.notificationList.map((service) => service.code))]),
  };
}

export function rowKey(row: Pick<AssignmentRow, "groupId" | "studentId">): string {
  return `${row.groupId}:${row.studentId}`;
}

export function rowScenarioId(draft: AssignmentDraft, row: AssignmentRow): string | null {
  return draft.mode === "single" ? draft.scenarioId : row.scenarioId;
}

export function positionForNewRow(taken: (string | null)[], roles: ScenarioRoles): string | null {
  const hasCalls = roles.callKeys.length > 0;

  if (roles.workspaceMode === "INDIVIDUAL") return hasCalls ? null : (roles.ddsServices[0] ?? null);
  if (hasCalls && !taken.includes(null)) return null;

  return (
    roles.mainServices.find((code) => !taken.includes(code)) ??
    roles.ddsServices.find((code) => !taken.includes(code)) ??
    null
  );
}

export function resolveRoles(draft: AssignmentDraft, rolesById: Map<string, ScenarioRoles>): AssignmentDraft {
  const taken = new Map<string, (string | null)[]>();

  for (const row of draft.rows) {
    const scenarioId = rowScenarioId(draft, row);

    if (row.manual && scenarioId !== null) taken.set(scenarioId, [...(taken.get(scenarioId) ?? []), row.position]);
  }

  const rows = draft.rows.map((row) => {
    const scenarioId = rowScenarioId(draft, row);
    const roles = scenarioId === null ? undefined : rolesById.get(scenarioId);

    if (row.manual || scenarioId === null || !roles) return row;

    const used = taken.get(scenarioId) ?? [];
    const position = positionForNewRow(used, roles);

    taken.set(scenarioId, [...used, position]);
    return { ...row, position };
  });

  return { ...draft, rows };
}

export function operatorsOf(draft: AssignmentDraft, scenarioId: string): string[] {
  return draft.rows
    .filter((row) => rowScenarioId(draft, row) === scenarioId && row.position === null)
    .map((row) => row.studentId);
}

export function effectiveCallOperators(draft: AssignmentDraft, roles: ScenarioRoles): Record<string, string> {
  const operators = operatorsOf(draft, roles.scenarioId);

  if (roles.workspaceMode !== "SHARED" || operators.length <= 1) return {};

  return Object.fromEntries(
    roles.callKeys.map((key, index) => {
      const chosen = draft.callOperators[key];

      return [key, chosen !== undefined && operators.includes(chosen) ? chosen : (operators[index % operators.length] ?? "")];
    }),
  );
}

export function activeAssignmentKeys(assignments: TeacherAssignment[]): Set<string> {
  return new Set(
    assignments
      .filter((assignment) => ACTIVE_STATUSES.has(assignment.status))
      .flatMap((assignment) => assignment.participants.map((participant) => `${assignment.scenarioId}:${participant.userId}`)),
  );
}

function error(path: string, message: string): AssignmentIssue {
  return { path, message, severity: "error" };
}

function warning(path: string, message: string): AssignmentIssue {
  return { path, message, severity: "warning" };
}

function dateIssues(draft: AssignmentDraft, now: number): AssignmentIssue[] {
  const from = draft.availableFrom === null ? null : Date.parse(draft.availableFrom);
  const due = draft.dueAt === null ? null : Date.parse(draft.dueAt);

  return [
    ...(from !== null && due !== null && due <= from ? [error("dueAt", "Срок должен быть позже начала.")] : []),
    ...(due !== null && due < now ? [warning("dueAt", "Срок уже прошёл: обучаемые не смогут начать занятие.")] : []),
    ...(!Number.isInteger(draft.maxAttempts) || draft.maxAttempts < 1 || draft.maxAttempts > MAX_ATTEMPTS
      ? [error("maxAttempts", `Число попыток — от 1 до ${MAX_ATTEMPTS}.`)]
      : []),
  ];
}

function sharedIssues(draft: AssignmentDraft, roles: ScenarioRoles, serviceName: (code: string) => string): AssignmentIssue[] {
  const indexed = draft.rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => rowScenarioId(draft, row) === roles.scenarioId);
  const count = indexed.length;
  const groups = new Set(indexed.map(({ row }) => row.groupId));
  const positions = indexed.flatMap(({ row }) => (row.position === null ? [] : [row.position]));
  const operators = indexed.filter(({ row }) => row.position === null).length;

  return [
    ...(count < roles.minParticipants || count > roles.maxParticipants
      ? [
          error(
            "rows",
            `Общее рабочее место рассчитано на ${roles.minParticipants}–${roles.maxParticipants} участников, выбрано ${count}.`,
          ),
        ]
      : []),
    ...(groups.size > 1
      ? [error("rows", "Общее рабочее место назначается участникам одной группы: сервер создаёт занятие на группу.")]
      : []),
    ...(roles.callKeys.length > 0 && operators === 0
      ? [error("roles", "В сценарии есть звонки: назначьте хотя бы одного оператора 112.")]
      : []),
    ...(roles.callKeys.length === 0 && operators > 0
      ? [warning("roles", "Звонков в сценарии нет: у оператора 112 не будет работы.")]
      : []),
    ...indexed.flatMap(({ row, index }) =>
      row.position !== null && positions.indexOf(row.position) !== positions.lastIndexOf(row.position)
        ? [error(`rows.${index}.position`, `Позицию «${serviceName(row.position)}» занимают несколько участников.`)]
        : [],
    ),
    ...roles.mainServices
      .filter((code) => !positions.includes(code))
      .map((code) => error("roles", `Позиция «${serviceName(code)}» не занята: карточки этой службы никто не примет.`)),
  ];
}

function individualIssues(
  draft: AssignmentDraft,
  roles: ScenarioRoles,
  serviceName: (code: string) => string,
): AssignmentIssue[] {
  const hasCalls = roles.callKeys.length > 0;

  return [
    ...(hasCalls && (roles.cardCount > 0 || roles.procedural)
      ? [
          warning(
            "roles",
            `«${roles.name}»: в индивидуальном режиме обучаемый работает оператором 112, карточки ДДС этого сценария останутся без обработки.`,
          ),
        ]
      : []),
    ...draft.rows.flatMap((row, index) => {
      if (rowScenarioId(draft, row) !== roles.scenarioId) return [];
      if (hasCalls && row.position !== null) {
        return [error(`rows.${index}.position`, "В сценарии есть звонки: обучаемый должен быть оператором 112.")];
      }
      if (!hasCalls && row.position === null) {
        return [error(`rows.${index}.position`, "Выберите службу ДДС, за которую работает обучаемый.")];
      }
      if (row.position !== null && roles.ddsServices.length > 0 && !roles.ddsServices.includes(row.position)) {
        return [warning(`rows.${index}.position`, `Карточки сценария не приходят в «${serviceName(row.position)}».`)];
      }
      return [];
    }),
  ];
}

export interface ValidationInput {
  rolesById: Map<string, ScenarioRoles>;
  active: Set<string>;
  now: number;
  serviceName: (code: string) => string;
}

export function validateAssignment(draft: AssignmentDraft, input: ValidationInput): AssignmentIssue[] {
  const { rolesById, active, now, serviceName } = input;
  const studentCounts = new Map<string, number>();

  for (const row of draft.rows) studentCounts.set(row.studentId, (studentCounts.get(row.studentId) ?? 0) + 1);

  const scenarioIds = unique(draft.rows.flatMap((row) => rowScenarioId(draft, row) ?? []));
  const rowIssues = draft.rows.flatMap((row, index): AssignmentIssue[] => {
    const scenarioId = rowScenarioId(draft, row);
    const roles = scenarioId === null ? undefined : rolesById.get(scenarioId);

    return [
      ...(draft.mode === "perStudent" && scenarioId === null
        ? [error(`rows.${index}.scenarioId`, "Выберите сценарий для обучаемого.")]
        : []),
      ...(draft.mode === "perStudent" && roles?.workspaceMode === "SHARED"
        ? [error(`rows.${index}.scenarioId`, "Сценарий с общим рабочим местом назначается в режиме «Одно задание всем».")]
        : []),
      ...((studentCounts.get(row.studentId) ?? 0) > 1
        ? [error(`rows.${index}.studentId`, "Обучаемый выбран в двух группах: оставьте одну.")]
        : []),
      ...(scenarioId !== null && active.has(`${scenarioId}:${row.studentId}`)
        ? [warning(`rows.${index}.studentId`, "У обучаемого уже есть активное занятие по этому сценарию.")]
        : []),
    ];
  });

  return [
    ...(draft.mode === "single" && draft.scenarioId === null ? [error("scenarioId", "Выберите сценарий.")] : []),
    ...(draft.rows.length === 0 ? [error("rows", "Выберите обучаемых.")] : []),
    ...(draft.rows.length > MAX_PARTICIPANTS ? [error("rows", `Не больше ${MAX_PARTICIPANTS} обучаемых за раз.`)] : []),
    ...scenarioIds.flatMap((scenarioId) => {
      const roles = rolesById.get(scenarioId);

      if (!roles) return [error("scenarioId", "Состав сценария не загружен: роли проверить нельзя.")];

      return roles.workspaceMode === "SHARED"
        ? draft.mode === "single"
          ? sharedIssues(draft, roles, serviceName)
          : []
        : individualIssues(draft, roles, serviceName);
    }),
    ...rowIssues,
    ...dateIssues(draft, now),
  ];
}

export function hasAssignmentErrors(issues: AssignmentIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

function requestBody(
  draft: AssignmentDraft,
  roles: ScenarioRoles,
  rows: AssignmentRow[],
  userId: string,
): GroupAssignmentCreateDto {
  const shared = roles.workspaceMode === "SHARED";

  return {
    scenario_id: roles.scenarioId,
    assigned_by: userId,
    participant_ids: rows.map((row) => row.studentId),
    participant_positions: Object.fromEntries(rows.map((row) => [row.studentId, row.position])),
    incoming_call_operators: shared ? effectiveCallOperators(draft, roles) : {},
    launch_policy: shared ? "TEACHER_START" : "STUDENT_SELF_START",
    max_attempts: draft.maxAttempts,
    available_from: draft.availableFrom,
    due_at: draft.dueAt,
  };
}

export function planRequests(
  draft: AssignmentDraft,
  rolesById: Map<string, ScenarioRoles>,
  userId: string,
): PlannedRequest[] {
  const buckets = new Map<string, { groupId: string; roles: ScenarioRoles; rows: AssignmentRow[] }>();

  for (const row of draft.rows) {
    const scenarioId = rowScenarioId(draft, row);
    const roles = scenarioId === null ? undefined : rolesById.get(scenarioId);

    if (!roles) continue;

    const key = `${row.groupId}:${roles.scenarioId}`;
    const bucket = buckets.get(key) ?? { groupId: row.groupId, roles, rows: [] };

    buckets.set(key, { ...bucket, rows: [...bucket.rows, row] });
  }

  return [...buckets.entries()].flatMap(([key, { groupId, roles, rows }]) => {
    const request = (suffix: string, selected: AssignmentRow[]): PlannedRequest => ({
      key: `${key}:${suffix}`,
      groupId,
      scenarioId: roles.scenarioId,
      studentIds: selected.map((row) => row.studentId),
      body: requestBody(draft, roles, selected, userId),
    });

    if (roles.workspaceMode === "SHARED") return [request("shared", rows)];

    const operators = rows.filter((row) => row.position === null);
    const batches = rows
      .filter((row) => row.position !== null)
      .reduce<AssignmentRow[][]>((result, row) => {
        const free = result.find((batch) => batch.every((member) => member.position !== row.position));

        return free ? result.map((batch) => (batch === free ? [...batch, row] : batch)) : [...result, [row]];
      }, []);

    return [
      ...(operators.length > 0 ? [request("operators", operators)] : []),
      ...batches.map((batch, index) => request(`dispatchers-${index + 1}`, batch)),
    ];
  });
}

export async function runRequests(
  requests: PlannedRequest[],
  send: (request: PlannedRequest) => Promise<string>,
  describe: (failure: unknown) => string,
): Promise<RequestOutcome[]> {
  const outcomes: RequestOutcome[] = [];

  for (const request of requests) {
    try {
      outcomes.push({ request, result: { ok: true, lessonId: await send(request) } });
    } catch (failure) {
      outcomes.push({ request, result: { ok: false, message: describe(failure) } });
    }
  }

  return outcomes;
}

export function failedRequests(outcomes: RequestOutcome[]): PlannedRequest[] {
  return outcomes.flatMap((outcome) => (outcome.result.ok ? [] : [outcome.request]));
}

const knownDetails: [RegExp, string][] = [
  [/published scenario/i, "Сценарий не утверждён."],
  [/participant range/i, "Число участников вне диапазона сценария."],
  [/each DDS position/i, "Одну позицию ДДС в занятии может занимать только один участник."],
  [/due_at must be later/i, "Срок должен быть позже начала."],
  [/needs an operator 112/i, "В сценарии есть звонки, а оператора 112 нет."],
  [/Assign every incoming call/i, "Каждый звонок нужно закрепить за оператором 112."],
  [/does not own this learning group/i, "Группа принадлежит другому преподавателю."],
  [/group is archived/i, "Группа в архиве."],
  [/outside the active learning group/i, "Обучаемый больше не состоит в группе."],
  [/Inactive or missing .*template/i, "Шаблон из состава сценария деактивирован."],
  [/Unknown or inactive participant service/i, "Служба позиции ДДС неизвестна или неактивна."],
  [/Training scenario not found/i, "Сценарий не найден."],
];

export function assignmentFailureText(status: number | undefined, detail: unknown): string {
  if (typeof detail === "string") {
    const known = knownDetails.find(([pattern]) => pattern.test(detail));

    if (known) return known[1];
    if (status === 422 || status === 409) return `Сервер отклонил назначение: ${detail}`;
  }
  if (status === 422 && Array.isArray(detail)) return "Сервер отклонил данные назначения: проверьте поля формы.";

  return "Сервер не ответил. Повторите попытку позже.";
}
