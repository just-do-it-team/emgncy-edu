import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScenarioDetail, ScenarioItem } from "@/shared/api";
import {
  assignmentFailureText,
  effectiveCallOperators,
  emptyAssignmentDraft,
  failedRequests,
  hasAssignmentErrors,
  planRequests,
  resolveRoles,
  runRequests,
  scenarioRolesOf,
  validateAssignment,
  type AssignmentDraft,
  type ScenarioRoles,
} from "./assignment-plan.ts";

const NOW = Date.parse("2026-09-27T12:00:00+03:00");
const TEACHER = "teacher-1";
const GROUP_A = "group-a";
const GROUP_B = "group-b";

const callRoles: ScenarioRoles = {
  scenarioId: "s-call",
  name: "Задымление в жилом доме",
  revision: 2,
  difficulty: 2,
  workspaceMode: "INDIVIDUAL",
  minParticipants: 1,
  maxParticipants: 1,
  callKeys: ["call-1"],
  cardCount: 0,
  procedural: false,
  mainServices: [],
  ddsServices: [],
};

const ddsRoles: ScenarioRoles = {
  ...callRoles,
  scenarioId: "s-dds",
  name: "Запах газа в квартире",
  callKeys: [],
  cardCount: 1,
  mainServices: ["104"],
  ddsServices: ["104", "101"],
};

const sharedRoles: ScenarioRoles = {
  ...callRoles,
  scenarioId: "s-shared",
  name: "ДТП с пострадавшими на МКАД",
  workspaceMode: "SHARED",
  minParticipants: 2,
  maxParticipants: 4,
  callKeys: ["call-1", "call-2"],
  cardCount: 2,
  mainServices: ["103", "102"],
  ddsServices: ["103", "102", "101"],
};

const rolesById = new Map([callRoles, ddsRoles, sharedRoles].map((roles) => [roles.scenarioId, roles]));
const serviceName = (code: string) => `служба ${code}`;
const input = { rolesById, active: new Set<string>(), now: NOW, serviceName };

function rows(groupId: string, ids: string[], scenarioId: string | null = null) {
  return ids.map((studentId) => ({ groupId, studentId, scenarioId, position: null, manual: false }));
}

function single(scenarioId: string, studentIds: string[], groupId = GROUP_A): AssignmentDraft {
  return resolveRoles({ ...emptyAssignmentDraft, scenarioId, rows: rows(groupId, studentIds) }, rolesById);
}

describe("роли сценария", () => {
  it("звонки, главные службы и службы оповещения собираются из состава", () => {
    const item = (key: string, itemType: ScenarioItem["itemType"], main: string | null, services: string[]): ScenarioItem => ({
      key,
      itemType,
      sourceType: "TEMPLATE",
      templateId: key,
      trigger: null,
      templateName: null,
      expectedCard: null,
      inlineInitialCard: null,
      inlineExpectedResult: null,
      classification: null,
      mainService: main === null ? null : { code: main, name: null },
      notificationList: services.map((code) => ({ code, name: null })),
    });
    const detail: ScenarioDetail = {
      id: "s1",
      name: "Смешанный",
      description: null,
      difficulty: 3,
      estimatedDurationSeconds: 600,
      cardsCount: 3,
      schemaVersion: 2,
      mode: "STATIC",
      workspaceMode: "SHARED",
      completionPolicy: "TEACHER_ONLY",
      minParticipants: 2,
      maxParticipants: 4,
      revision: 4,
      status: "PUBLISHED",
      createdBy: TEACHER,
      createdAt: "2026-09-20T10:00:00+03:00",
      updatedAt: "2026-09-21T10:00:00+03:00",
      composition: { itemTypes: ["INCOMING_CALL", "INCIDENT_CARD"], procedural: false },
      procedural: null,
      items: [
        item("call-1", "INCOMING_CALL", null, []),
        item("card-1", "INCIDENT_CARD", "104", ["104", "101"]),
        item("card-2", "INCIDENT_CARD", "103", ["103", "101"]),
      ],
    };
    const roles = scenarioRolesOf(detail);

    assert.deepEqual(roles.callKeys, ["call-1"]);
    assert.deepEqual(roles.mainServices, ["104", "103"]);
    assert.deepEqual(roles.ddsServices, ["104", "103", "101"]);
    assert.equal(roles.cardCount, 2);
  });
});

describe("распределение ролей", () => {
  it("индивидуальный сценарий со звонками — оператор 112, без звонков — первая служба", () => {
    assert.deepEqual(single("s-call", ["u1", "u2"]).rows.map((row) => row.position), [null, null]);
    assert.deepEqual(single("s-dds", ["u1", "u2"]).rows.map((row) => row.position), ["104", "104"]);
  });

  it("общее рабочее место: оператор, затем главные службы, затем прочие", () => {
    const draft = single("s-shared", ["u1", "u2", "u3", "u4"]);

    assert.deepEqual(draft.rows.map((row) => row.position), [null, "103", "102", "101"]);
    assert.equal(hasAssignmentErrors(validateAssignment(draft, input)), false);
  });

  it("незанятая главная служба и повтор позиции — ошибки", () => {
    const draft = single("s-shared", ["u1", "u2", "u3"]);
    const broken = { ...draft, rows: draft.rows.map((row, index) => (index === 2 ? { ...row, position: "103", manual: true } : row)) };
    const issues = validateAssignment(broken, input);

    assert.ok(issues.some((issue) => issue.path === "rows.2.position" && issue.severity === "error"));
    assert.ok(issues.some((issue) => issue.path === "roles" && /служба 102/.test(issue.message)));
  });

  it("звонки без оператора и участники из разных групп — ошибки", () => {
    const draft: AssignmentDraft = {
      ...single("s-shared", ["u1", "u2"]),
      rows: [
        { groupId: GROUP_A, studentId: "u1", scenarioId: null, position: "103", manual: true },
        { groupId: GROUP_B, studentId: "u2", scenarioId: null, position: "102", manual: true },
      ],
    };
    const messages = validateAssignment(draft, input).map((issue) => issue.message);

    assert.ok(messages.some((message) => /оператора 112/.test(message)));
    assert.ok(messages.some((message) => /одной группы/.test(message)));
  });

  it("несколько операторов — звонки закрепляются по кругу, выбор преподавателя сохраняется", () => {
    const draft: AssignmentDraft = {
      ...single("s-shared", ["u1", "u2", "u3", "u4"]),
      rows: [
        { groupId: GROUP_A, studentId: "u1", scenarioId: null, position: null, manual: true },
        { groupId: GROUP_A, studentId: "u2", scenarioId: null, position: null, manual: true },
        { groupId: GROUP_A, studentId: "u3", scenarioId: null, position: "103", manual: true },
        { groupId: GROUP_A, studentId: "u4", scenarioId: null, position: "102", manual: true },
      ],
    };

    assert.deepEqual(effectiveCallOperators(draft, sharedRoles), { "call-1": "u1", "call-2": "u2" });
    assert.deepEqual(effectiveCallOperators({ ...draft, callOperators: { "call-1": "u2" } }, sharedRoles), {
      "call-1": "u2",
      "call-2": "u2",
    });
  });
});

describe("даты", () => {
  it("по умолчанию без ограничений, как на сервере", () => {
    const [request] = planRequests(single("s-call", ["u1"]), rolesById, TEACHER);

    assert.equal(request?.body.available_from, null);
    assert.equal(request?.body.due_at, null);
    assert.equal(request?.body.max_attempts, 1);
  });

  it("срок не позже начала — ошибка, прошедший срок — предупреждение", () => {
    const draft = {
      ...single("s-call", ["u1"]),
      availableFrom: "2026-09-26T10:00:00.000Z",
      dueAt: "2026-09-26T09:00:00.000Z",
    };
    const issues = validateAssignment(draft, input).filter((issue) => issue.path === "dueAt");

    assert.deepEqual(
      issues.map((issue) => issue.severity),
      ["error", "warning"],
    );
  });
});

describe("тело запроса", () => {
  it("индивидуальный сценарий: один пакет на группу, запуск самим обучаемым", () => {
    const requests = planRequests(single("s-call", ["u1", "u2"]), rolesById, TEACHER);

    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0]?.body, {
      scenario_id: "s-call",
      assigned_by: TEACHER,
      participant_ids: ["u1", "u2"],
      participant_positions: { u1: null, u2: null },
      incoming_call_operators: {},
      launch_policy: "STUDENT_SELF_START",
      max_attempts: 1,
      available_from: null,
      due_at: null,
    });
  });

  it("индивидуальный ДДС: одна служба у двоих — два пакета, сервер не пускает одну позицию дважды в пакет", () => {
    const requests = planRequests(single("s-dds", ["u1", "u2"]), rolesById, TEACHER);

    assert.deepEqual(
      requests.map((request) => request.studentIds),
      [["u1"], ["u2"]],
    );
    assert.deepEqual(requests[0]?.body.participant_positions, { u1: "104" });
  });

  it("индивидуальный ДДС: разные службы идут одним пакетом, повтор службы — следующим", () => {
    const draft: AssignmentDraft = {
      ...emptyAssignmentDraft,
      scenarioId: "s-dds",
      rows: [
        { groupId: GROUP_A, studentId: "u1", scenarioId: null, position: "104", manual: true },
        { groupId: GROUP_A, studentId: "u2", scenarioId: null, position: "101", manual: true },
        { groupId: GROUP_A, studentId: "u3", scenarioId: null, position: "104", manual: true },
      ],
    };

    assert.deepEqual(
      planRequests(draft, rolesById, TEACHER).map((request) => request.studentIds),
      [["u1", "u2"], ["u3"]],
    );
  });

  it("общее рабочее место: один пакет, запуск преподавателем", () => {
    const [request, ...rest] = planRequests(single("s-shared", ["u1", "u2"]), rolesById, TEACHER);

    assert.equal(rest.length, 0);
    assert.equal(request?.body.launch_policy, "TEACHER_START");
    assert.deepEqual(request?.body.participant_positions, { u1: null, u2: "103" });
  });

  it("разные задания: пакет на пару «группа — сценарий»", () => {
    const draft = resolveRoles(
      {
        ...emptyAssignmentDraft,
        mode: "perStudent",
        rows: [
          ...rows(GROUP_A, ["u1", "u5"], "s-call"),
          ...rows(GROUP_A, ["u3"], "s-dds"),
          ...rows(GROUP_B, ["u9"], "s-call"),
        ],
      },
      rolesById,
    );
    const requests = planRequests(draft, rolesById, TEACHER);

    assert.deepEqual(
      requests.map((request) => [request.groupId, request.scenarioId, request.studentIds]),
      [
        [GROUP_A, "s-call", ["u1", "u5"]],
        [GROUP_A, "s-dds", ["u3"]],
        [GROUP_B, "s-call", ["u9"]],
      ],
    );
    assert.equal(hasAssignmentErrors(validateAssignment(draft, input)), false);
  });

  it("разные задания: строка без сценария и общий сценарий — ошибки", () => {
    const draft: AssignmentDraft = {
      ...emptyAssignmentDraft,
      mode: "perStudent",
      rows: [...rows(GROUP_A, ["u1"]), ...rows(GROUP_A, ["u2"], "s-shared")],
    };
    const paths = validateAssignment(draft, input).map((issue) => issue.path);

    assert.ok(paths.includes("rows.0.scenarioId"));
    assert.ok(paths.includes("rows.1.scenarioId"));
  });

  it("активное занятие по сценарию — предупреждение, не ошибка", () => {
    const issues = validateAssignment(single("s-call", ["u1"]), { ...input, active: new Set(["s-call:u1"]) });

    assert.equal(hasAssignmentErrors(issues), false);
    assert.ok(issues.some((issue) => issue.path === "rows.0.studentId" && issue.severity === "warning"));
  });
});

describe("частичный успех", () => {
  it("неудавшиеся запросы собираются для повтора, созданные — с занятием", async () => {
    const draft = resolveRoles(
      {
        ...emptyAssignmentDraft,
        mode: "perStudent",
        rows: [...rows(GROUP_A, ["u1"], "s-call"), ...rows(GROUP_B, ["u2"], "s-call")],
      },
      rolesById,
    );
    const requests = planRequests(draft, rolesById, TEACHER);
    const outcomes = await runRequests(
      requests,
      async (request) => {
        if (request.groupId === GROUP_B) throw new Error("Learning group is archived");
        return `lesson-${request.groupId}`;
      },
      (failure) => assignmentFailureText(422, failure instanceof Error ? failure.message : undefined),
    );

    assert.deepEqual(
      outcomes.map((outcome) => outcome.result),
      [
        { ok: true, lessonId: `lesson-${GROUP_A}` },
        { ok: false, message: "Группа в архиве." },
      ],
    );
    assert.deepEqual(
      failedRequests(outcomes).map((request) => request.groupId),
      [GROUP_B],
    );
  });

  it("неизвестная причина показывается как есть, обрыв связи — общим текстом", () => {
    assert.equal(assignmentFailureText(422, "Something new"), "Сервер отклонил назначение: Something new");
    assert.equal(assignmentFailureText(undefined, undefined), "Сервер не ответил. Повторите попытку позже.");
  });
});
