import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OperatorClassificationDto, ScenarioDetail, ScenarioTemplate } from "@/shared/api";
import { estimateDurationSeconds, type DurationNorms } from "./duration.ts";
import { emptyExpected, emptyTemplateDraft } from "./expected-draft.ts";
import {
  defaultTrigger,
  emptyScenarioDraft,
  moveItem,
  nextItemKey,
  scenarioCreateBody,
  scenarioDraftFromDetail,
  scenarioUpdateBody,
  type ScenarioDraft,
  type ScenarioItemDraft,
} from "./scenario-draft.ts";
import { eligiblePoolSize, validateScenarioDraft, type ScenarioValidationContext } from "./scenario-validation.ts";
import { failureOf, scenarioPathOf } from "./server-failure.ts";
import { strictnessOf } from "./strictness.ts";
import { comparisonOf } from "./expected-fields.ts";
import { resolvedScenarioRole, suggestedPositions } from "./scenario-role.ts";

const classification: OperatorClassificationDto = {
  record_id: 13020201,
  group_code: 13,
  feature_1_code: 2,
  feature_2_code: 2,
  feature_3_code: 1,
  final_incident_type: "Запах бытового газа в квартире",
  routing_flags: {},
  excluded_service_codes: [],
};

const resolve = () => classification;

function template(id: string, kind: ScenarioTemplate["kind"], overrides: Partial<ScenarioTemplate> = {}): ScenarioTemplate {
  return {
    id,
    templateKey: `key-${id}`,
    kind,
    variant: kind === "call" ? "call" : "card112",
    version: 1,
    name: id,
    description: null,
    difficulty: 1,
    isActive: true,
    createdBy: "teacher",
    createdAt: "2026-09-20T10:00:00+03:00",
    initialCard: null,
    initialCall: null,
    expectedResult: {},
    recordId: 13020201,
    services: ["104"],
    ...overrides,
  };
}

const call: ScenarioItemDraft = {
  key: "call-1",
  itemType: "INCOMING_CALL",
  trigger: { kind: "immediate" },
  source: { kind: "TEMPLATE", templateId: "t-call" },
};

function inlineCard(key: string): ScenarioItemDraft {
  const draft = emptyTemplateDraft("cardDds");

  return {
    key,
    itemType: "INCIDENT_CARD",
    trigger: { kind: "after", itemKey: "call-1", actionType: "INCOMING_CALL_COMPLETED", delaySeconds: 45 },
    source: {
      kind: "INLINE",
      variant: "cardDds",
      card: draft.card,
      expected: {
        ...emptyExpected("INLINE"),
        recordId: 13020201,
        services: ["104"],
        history: { "104": [{ status: "RECEIVED", comment: "", unitNumber: "" }] },
        fields: {
          ...draft.expected.fields,
          description: "Запах газа",
          automaticPhoneNumber: "+79161263471",
          incidentAddress: { ...draft.expected.fields.incidentAddress, street: "Ленинский проспект", house: "14" },
        },
      },
    },
  };
}

const draft: ScenarioDraft = { ...emptyScenarioDraft, name: "Запах газа: звонок и карточка ДДС", items: [call, inlineCard("card-2")] };

const context: ScenarioValidationContext = {
  recordExists: () => true,
  activeServices: new Set(["104"]),
  templates: new Map([["t-call", template("t-call", "call")]]),
  cardTemplates: [template("c1", "card"), template("c2", "card", { difficulty: 3 }), template("c3", "card", { isActive: false })],
};

const norms: DurationNorms = { cardReactionSeconds: 210, proceduralInitialDelaySeconds: 5, proceduralIntervalSeconds: 180 };

describe("тело сценария", () => {
  it("шаблон и встроенная карточка с условием «после действия»", () => {
    const body = scenarioCreateBody(draft, resolve, 600, "teacher");
    const [first, second] = body.definition.cards;

    assert.equal(body.status, "DRAFT");
    assert.equal(body.definition.schema_version, 2);
    assert.equal(body.definition.mode, "STATIC");
    assert.deepEqual(first, {
      key: "call-1",
      item_type: "INCOMING_CALL",
      trigger_type: "TIME_OFFSET",
      trigger_config: { offset_seconds: 0 },
      source_type: "TEMPLATE",
      template_id: "t-call",
    });
    assert.equal(second?.trigger_type, "AFTER_ACTION");
    assert.deepEqual(second?.trigger_config, { card_key: "call-1", action_type: "INCOMING_CALL_COMPLETED", delay_seconds: 45 });
    assert.equal(second?.source_type, "INLINE");
    assert.ok(second?.expected_result && !("applicant_full_name" in (second.expected_result.card as object)));
  });

  it("процедурная подача: смешанный режим, версия схемы 3, пул по группам", () => {
    const body = scenarioUpdateBody(
      { ...draft, procedural: { enabled: true, targetCount: 2, poolKind: "groups", templateIds: [], groupCodes: [13] } },
      resolve,
      900,
      "teacher",
      4,
    );

    assert.equal(body.expected_revision, 4);
    assert.equal(body.definition.mode, "HYBRID");
    assert.equal(body.definition.schema_version, 3);
    assert.deepEqual(body.definition.procedural_generation?.template_pool, { classification_group_codes: [13] });
  });

  it("общее рабочее место — завершает преподаватель", () => {
    const body = scenarioCreateBody(
      { ...draft, workspaceMode: "SHARED", completionPolicy: "STUDENT_CONFIRM", minParticipants: 2, maxParticipants: 4 },
      resolve,
      600,
      "teacher",
    );

    assert.equal(body.completion_policy, "TEACHER_ONLY");
    assert.equal(body.max_participants, 4);
  });
});

describe("порядок и условия подачи", () => {
  it("перемещение элемента", () => {
    assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
    assert.deepEqual(moveItem(["a", "b"], 0, 5), ["a", "b"]);
  });

  it("ключи новых элементов не повторяются", () => {
    assert.equal(nextItemKey(draft.items, "INCOMING_CALL"), "call-3");
    assert.equal(nextItemKey([{ ...call, key: "card-2" }], "INCIDENT_CARD"), "card-3");
  });

  it("первый элемент — сразу, следующие — с шагом", () => {
    assert.deepEqual(defaultTrigger(0), { kind: "immediate" });
    assert.deepEqual(defaultTrigger(2), { kind: "offset", seconds: 240 });
  });

  it("действие не из закрытого списка источника — ошибка", () => {
    const [, second] = draft.items;
    assert.ok(second);
    const issues = validateScenarioDraft(
      {
        ...draft,
        items: [call, { ...second, trigger: { kind: "after", itemKey: "call-1", actionType: "CARD_ACCEPTED", delaySeconds: 0 } }],
      },
      context,
    );

    assert.ok(issues.some((issue) => issue.path === "items.1.trigger.actionType"));
  });

  it("цикл условий подачи — ошибка", () => {
    const loop = validateScenarioDraft(
      {
        ...draft,
        items: [
          { ...inlineCard("card-a"), trigger: { kind: "after", itemKey: "card-b", actionType: "CARD_OPENED", delaySeconds: 0 } },
          { ...inlineCard("card-b"), trigger: { kind: "after", itemKey: "card-a", actionType: "CARD_OPENED", delaySeconds: 0 } },
        ],
      },
      context,
    );

    assert.ok(loop.some((issue) => /цикл/.test(issue.message)));
  });

  it("корректный сценарий без ошибок; деактивированный шаблон — ошибка", () => {
    assert.equal(validateScenarioDraft(draft, context).filter((issue) => issue.severity === "error").length, 0);

    const inactive = { ...context, templates: new Map([["t-call", template("t-call", "call", { isActive: false })]]) };

    assert.ok(validateScenarioDraft(draft, inactive).some((issue) => issue.path === "items.0.source"));
  });
});

describe("процедурный пул", () => {
  it("учитываются только активные шаблоны не сложнее сценария", () => {
    assert.equal(eligiblePoolSize({ ...draft, difficulty: 1 }, context.cardTemplates), 1);
    assert.equal(eligiblePoolSize({ ...draft, difficulty: 3 }, context.cardTemplates), 2);
  });
});

describe("оценка длительности", () => {
  it("звонок норматива не добавляет; после действия — только задержка, карточка — окно реакции", () => {
    assert.equal(estimateDurationSeconds(draft, norms), 300);
  });

  it("только звонки — минимум минута, дальнейшая работа не учитывается", () => {
    assert.equal(estimateDurationSeconds({ ...draft, items: [call] }, norms), 60);
  });

  it("процедурная подача: последняя карточка и окно реакции на неё", () => {
    const procedural = { ...emptyScenarioDraft, procedural: { ...emptyScenarioDraft.procedural, enabled: true, targetCount: 3 } };

    assert.equal(estimateDurationSeconds(procedural, norms), 600);
  });
});

describe("сводка строгости", () => {
  it("считает режимы по полям эталонов", () => {
    const summary = strictnessOf([
      {
        source: "TEMPLATE",
        expected: {
          card: {
            classification: {},
            description: "Дым",
            applicant_full_name: null,
            incident_address: "Москва, ул. Берзарина, д. 21",
            automatic_phone_number: "+79161263471",
          },
        },
      },
      {
        source: "INLINE",
        expected: {
          card: { classification: {}, description: "Газ" },
          service_status_history: {
            "104": [{ status: "RECEIVED" }, { status: "ACCEPTED", comment: "Бригада направлена" }],
          },
        },
      },
    ]);

    assert.equal(summary.elements, 2);
    assert.equal(summary.strict, 3);
    assert.equal(summary.normalized, 1);
    assert.equal(summary.notScored, 3);
    assert.equal(summary.mustBeEmpty, 1);
    assert.equal(summary.notChecked, 19);
  });
});

describe("ответ сервера", () => {
  it("403 — только автор, текст по виду сущности", () => {
    assert.deepEqual(failureOf(403, "Only the scenario author can modify or archive it", scenarioPathOf), {
      kind: "forbidden",
      message: "Это может сделать только автор сценария.",
    });
    assert.deepEqual(failureOf(403, "Only the template author can create a new version", scenarioPathOf), {
      kind: "forbidden",
      message: "Это может сделать только автор шаблона.",
    });
  });

  it("409 — конфликт, правки не теряются", () => {
    assert.deepEqual(failureOf(409, "Scenario revision conflict: expected 2, actual 3", scenarioPathOf), {
      kind: "conflict",
      message: "Scenario revision conflict: expected 2, actual 3",
    });
  });

  it("422 — ошибки с привязкой к элементу и полю", () => {
    const failure = failureOf(
      422,
      [
        { loc: ["body", "definition", "cards", 1, "expected_result", "card", "services"], msg: "unknown service", type: "value_error" },
        { loc: ["body", "name"], msg: "too long", type: "value_error" },
      ],
      scenarioPathOf,
    );

    assert.equal(failure.kind, "validation");
    assert.deepEqual(
      failure.kind === "validation" ? failure.issues.map((issue) => issue.path) : [],
      ["items.1.source.expected.services", "name"],
    );
  });

  it("прочие коды — общее сообщение", () => {
    assert.equal(failureOf(500, undefined, scenarioPathOf).kind, "other");
  });
});

describe("чтение сценария в черновик", () => {
  it("условия подачи и источники восстанавливаются", () => {
    const detail: ScenarioDetail = {
      id: "s1",
      name: "Сценарий",
      description: null,
      difficulty: 4,
      estimatedDurationSeconds: 600,
      passingScore: 80,
      requiredPositions: ["104"],
      cardsCount: 2,
      schemaVersion: 2,
      mode: "STATIC",
      workspaceMode: "INDIVIDUAL",
      completionPolicy: "STUDENT_CONFIRM",
      minParticipants: 1,
      maxParticipants: 1,
      revision: 3,
      status: "DRAFT",
      createdBy: "teacher",
      createdAt: "2026-09-20T10:00:00+03:00",
      updatedAt: "2026-09-21T10:00:00+03:00",
      composition: { itemTypes: ["INCOMING_CALL", "INCIDENT_CARD"], procedural: false },
      procedural: null,
      items: [
        {
          key: "call-1",
          itemType: "INCOMING_CALL",
          sourceType: "TEMPLATE",
          templateId: "t-call",
          trigger: { type: "TIME_OFFSET", offsetSeconds: 0 },
          templateName: "Звонок",
          expectedCard: null,
          inlineInitialCard: null,
          inlineExpectedResult: null,
          classification: null,
          mainService: null,
          notificationList: [],
        },
        {
          key: "card-2",
          itemType: "INCIDENT_CARD",
          sourceType: "INLINE",
          templateId: null,
          trigger: { type: "AFTER_ACTION", itemKey: "call-1", actionType: "INCOMING_CALL_COMPLETED", delaySeconds: 45 },
          templateName: null,
          expectedCard: null,
          inlineInitialCard: null,
          inlineExpectedResult: { card: { description: "Газ" }, service_status_history: { "104": [{ status: "RECEIVED" }] } },
          classification: null,
          mainService: null,
          notificationList: [],
        },
      ],
    };
    const parsed = scenarioDraftFromDetail(detail);

    assert.deepEqual(parsed.items[0]?.trigger, { kind: "immediate" });
    assert.equal(parsed.items[1]?.trigger.kind, "after");
    assert.equal(parsed.items[1]?.source.kind === "INLINE" && parsed.items[1].source.variant, "cardDds");
    assert.equal(parsed.difficulty, 4);
    assert.equal(parsed.passingScore, 80);
    assert.deepEqual(parsed.requiredPositions, ["104"]);
  });
});

describe("способ сравнения полей эталона", () => {
  it("ФИО и адреса — без учёта регистра и пунктуации, описание не оценивается, остальное строго", () => {
    assert.equal(comparisonOf("applicant_full_name"), "normalized");
    assert.equal(comparisonOf("reported_address"), "normalized");
    assert.equal(comparisonOf("incident_address"), "normalized");
    assert.equal(comparisonOf("description"), "not_scored");
    assert.equal(comparisonOf("automatic_phone_number"), "strict");
    assert.equal(comparisonOf("services"), "strict");
  });
});

describe("порог зачёта", () => {
  it("по умолчанию 100 и уходит в тело запроса", () => {
    assert.equal(scenarioCreateBody(draft, resolve, 600, "teacher").passing_score, 100);
    assert.equal(scenarioUpdateBody({ ...draft, passingScore: 75.5 }, resolve, 600, "teacher", 2).passing_score, 75.5);
  });

  it("вне 0–100, больше двух знаков после запятой или пустое — ошибка", () => {
    for (const passingScore of [-1, 100.5, 70.125, Number.NaN]) {
      const issues = validateScenarioDraft({ ...draft, passingScore }, context);

      assert.ok(issues.some((issue) => issue.path === "passingScore" && issue.severity === "error"), String(passingScore));
    }
    assert.ok(!validateScenarioDraft({ ...draft, passingScore: 0 }, context).some((issue) => issue.path === "passingScore"));
    assert.ok(!validateScenarioDraft({ ...draft, passingScore: 99.99 }, context).some((issue) => issue.path === "passingScore"));
  });
});

describe("роль сценария", () => {
  const composition = { itemTypes: ["INCOMING_CALL" as const, "INCIDENT_CARD" as const], procedural: false };

  it("обязательные позиции задают роль", () => {
    assert.deepEqual(resolvedScenarioRole([null], composition), { role: "OPERATOR_112", derived: false });
    assert.deepEqual(resolvedScenarioRole(["104"], composition), { role: "DDS", derived: false });
    assert.deepEqual(resolvedScenarioRole([null, "104"], composition), { role: "MIXED", derived: false });
  });

  it("без позиций — запасной вывод по составу", () => {
    assert.deepEqual(resolvedScenarioRole(null, composition), { role: "MIXED", derived: true });
    assert.deepEqual(resolvedScenarioRole(null, { itemTypes: ["INCIDENT_CARD"], procedural: false }), {
      role: "DDS",
      derived: true,
    });
  });

  it("подсказка по составу", () => {
    assert.deepEqual(
      suggestedPositions({ workspaceMode: "INDIVIDUAL", hasCalls: false, mainServices: ["104", "101"], minParticipants: 1 }),
      ["104"],
    );
    assert.deepEqual(
      suggestedPositions({ workspaceMode: "INDIVIDUAL", hasCalls: true, mainServices: ["104"], minParticipants: 1 }),
      [null],
    );
    assert.deepEqual(
      suggestedPositions({ workspaceMode: "SHARED", hasCalls: true, mainServices: ["104", "101", "104"], minParticipants: 2 }),
      [null, "104"],
    );
  });

  it("проверка позиций: уникальность, число, активность служб", () => {
    const paths = (positions: (string | null)[], extra: Partial<ScenarioDraft> = {}) =>
      validateScenarioDraft({ ...draft, ...extra, requiredPositions: positions }, context)
        .filter((issue) => issue.path === "requiredPositions" && issue.severity === "error")
        .map((issue) => issue.message);

    assert.equal(paths([null]).length, 0);
    assert.match(paths([null, "104"]).join(" "), /одну позицию/);
    assert.match(paths(["999"]).join(" "), /неизвестны или неактивны/);
    assert.match(
      paths([null, null], { workspaceMode: "SHARED", minParticipants: 3, maxParticipants: 4 }).join(" "),
      /не должны повторяться/,
    );
    assert.match(
      paths([null, "104"], { workspaceMode: "SHARED", minParticipants: 1, maxParticipants: 4 }).join(" "),
      /увеличьте минимум/,
    );
  });
});
