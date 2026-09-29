import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScenarioTemplate } from "@/shared/api";
import { removeItem, type ScenarioItemDraft } from "./scenario-draft.ts";
import { scenarioServerIssue } from "./scenario-validation.ts";
import { actualVersionOf, groupTemplates, templateProblem, templateProblemText } from "./template-library.ts";

const CALL_ID = "68ea175d-08c6-53fc-b046-1a18f5b80fed";
const CARD_V1_ID = "60683695-0b1c-5e36-9b7a-0f2d64d1a0c1";
const CARD_V2_ID = "307a1b75-6d22-540c-8665-7ead13745ed0";

function template(id: string, overrides: Partial<ScenarioTemplate> = {}): ScenarioTemplate {
  return {
    id,
    templateKey: "d0e308a4-6563-5b2e-9d6e-6a1c2b7f4e10",
    kind: "card",
    variant: "cardDds",
    version: 1,
    name: "ДДС-103: аллергическая реакция, неверный адрес",
    description: null,
    difficulty: 2,
    status: "PUBLISHED",
    generatedByAi: false,
    aiReviewState: null,
    generationId: null,
    isActive: true,
    createdBy: "teacher",
    createdByName: "Алексеев Владимир",
    createdAt: "2026-09-20T10:00:00+03:00",
    initialCard: null,
    initialCall: null,
    expectedResult: {},
    recordId: null,
    services: ["103"],
    ...overrides,
  };
}

const callTemplate = template(CALL_ID, {
  templateKey: "57d6bedc-d99a-5c4b-8f0e-2b3c4d5e6f70",
  kind: "call",
  variant: "call",
  name: "Входящий звонок 112: аллергическая реакция",
});
const archivedCard = template(CARD_V1_ID, { version: 3, isActive: false, status: "ARCHIVED" });
const actualCard = template(CARD_V2_ID, { version: 4 });

function item(key: string, templateId: string, trigger: ScenarioItemDraft["trigger"]): ScenarioItemDraft {
  return {
    key,
    itemType: key.startsWith("call") ? "INCOMING_CALL" : "INCIDENT_CARD",
    trigger,
    source: { kind: "TEMPLATE", templateId },
  };
}

describe("пригодность шаблона для состава", () => {
  it("опубликованная активная версия пригодна, деактивированная, черновик ИИ и отсутствующая — нет", () => {
    assert.equal(templateProblem(actualCard), null);
    assert.equal(templateProblem(archivedCard), "archived");
    assert.equal(templateProblem(template("ai", { status: "DRAFT", generatedByAi: true })), "aiDraft");
    assert.equal(templateProblem(undefined), "missing");
    assert.equal(templateProblemText("archived", archivedCard), "версия 3 деактивирована");
  });

  it("актуальная версия — старшая опубликованная с тем же ключом и видом", () => {
    const entries = groupTemplates([archivedCard, actualCard, callTemplate]);

    assert.equal(actualVersionOf(entries, archivedCard)?.id, CARD_V2_ID);
    assert.equal(actualVersionOf(entries, actualCard), null);
    assert.equal(actualVersionOf(entries, callTemplate), null);
  });
});

describe("удаление элемента из состава", () => {
  it("элемент, ждавший действия по удалённому, переходит на подачу по времени", () => {
    const items = [
      item("call-1", CALL_ID, { kind: "immediate" }),
      item("card-2", CARD_V2_ID, { kind: "after", itemKey: "call-1", actionType: "INCIDENT_CARD_CREATED", delaySeconds: 0 }),
      item("card-3", CARD_V2_ID, { kind: "offset", seconds: 300 }),
    ];

    const next = removeItem(items, 0);

    assert.deepEqual(
      next.map((candidate) => candidate.key),
      ["card-2", "card-3"],
    );
    assert.deepEqual(next[0]?.trigger, { kind: "immediate" });
    assert.deepEqual(next[1]?.trigger, { kind: "offset", seconds: 300 });
  });

  it("индекс вне состава ничего не меняет", () => {
    const items = [item("card-1", CARD_V2_ID, { kind: "immediate" })];

    assert.equal(removeItem(items, 5), items);
  });
});

describe("ошибка 422 сервера привязывается к элементу", () => {
  const items = [item("call-1", CALL_ID, { kind: "immediate" }), item("card-2", CARD_V1_ID, { kind: "offset", seconds: 120 })];
  const templates = new Map([callTemplate, archivedCard, actualCard].map((candidate) => [candidate.id, candidate]));

  it("недоступный шаблон карточки — элемент, название, вид, версия и причина", () => {
    const issue = scenarioServerIssue(`Inactive or missing card template: ${CARD_V1_ID}`, items, templates);

    assert.equal(issue?.path, "items.1.source");
    assert.match(issue?.message ?? "", /^Карточка 1 — «ДДС-103: аллергическая реакция, неверный адрес», Карточка ДДС, версия 3: версия 3 деактивирована/);
  });

  it("шаблон, которого нет в списке, — «не найден на сервере»", () => {
    const issue = scenarioServerIssue(`Inactive or missing incoming call template: ${CALL_ID}`, items, new Map());

    assert.equal(issue?.path, "items.0.source");
    assert.match(issue?.message ?? "", /шаблон не найден на сервере/);
  });

  it("правило эталона в шаблоне и ошибка встроенного элемента находят свой элемент", () => {
    const rule = scenarioServerIssue(
      `template ${CALL_ID}.expected_result: service 103 cannot use REJECTED or WORK_REFUSED; use WORK_COMPLETED with the no-brigade result`,
      items,
      templates,
    );
    const inline = scenarioServerIssue("scenario item card-2 requires expected_result.card", items, templates);

    assert.equal(rule?.path, "items.0.source");
    assert.match(rule?.message ?? "", /служба 103/);
    assert.equal(inline?.path, "items.1.source");
  });

  it("сообщение без шаблона и элемента не привязывается", () => {
    assert.equal(scenarioServerIssue("Scenario revision conflict: expected 1, actual 2", items, templates), null);
  });
});
