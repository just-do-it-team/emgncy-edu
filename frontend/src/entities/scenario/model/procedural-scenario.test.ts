import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScenarioTemplate } from "@/shared/api";
import { poolSizesAbove, proceduralPool, proceduralScenarioDraft } from "./procedural-scenario.ts";
import { definitionBody } from "./scenario-draft.ts";

const classification = { record_id: 3010101, group_code: 3 };

function template(id: string, overrides: Partial<ScenarioTemplate> = {}): ScenarioTemplate {
  return {
    id,
    templateKey: `key-${id}`,
    kind: "card",
    variant: "cardDds",
    version: 1,
    name: `ДДС-103: шаблон ${id}`,
    description: null,
    difficulty: 1,
    status: "PUBLISHED",
    generatedByAi: false,
    aiReviewState: null,
    generationId: null,
    isActive: true,
    createdBy: "teacher",
    createdByName: "Алексеев Владимир",
    createdAt: "2026-09-26T21:17:00+03:00",
    initialCard: { classification },
    initialCall: null,
    expectedResult: {},
    recordId: 3010101,
    services: ["103"],
    ...overrides,
  };
}

const templates = [
  template("dds-103"),
  template("dds-104", { services: ["104"] }),
  template("dds-103-hard", { difficulty: 3 }),
  template("dds-103-draft", { status: "DRAFT", generatedByAi: true }),
  template("dds-103-no-class", { initialCard: {} }),
  template("card-112", { variant: "card112", services: ["103"] }),
  template("call", { kind: "call", variant: "call", initialCard: null }),
];

const classify = () => null;

describe("процедурный пул", () => {
  it("для ДДС — опубликованные карточки ДДС выбранных служб, не сложнее сценария, с классификацией", () => {
    assert.deepEqual(
      proceduralPool(templates, ["103"], 1, []).map((candidate) => candidate.id),
      ["dds-103"],
    );
    assert.deepEqual(
      proceduralPool(templates, ["103", "104"], 3, []).map((candidate) => candidate.id),
      ["dds-103", "dds-104", "dds-103-hard"],
    );
  });

  it("подсказка по сложности — сколько шаблонов подойдёт на каждом уровне выше", () => {
    assert.deepEqual(poolSizesAbove(templates, ["103"], 1, []), [
      { difficulty: 2, size: 1 },
      { difficulty: 3, size: 2 },
      { difficulty: 4, size: 2 },
    ]);
    assert.deepEqual(poolSizesAbove(templates, ["103"], 4, []), []);
  });

  it("категории — по коду группы классификатора из исходной карточки", () => {
    const withCategories = [...templates, template("dds-103-fire", { initialCard: { classification: { record_id: 1010101, group_code: 1 } } })];

    assert.deepEqual(
      proceduralPool(withCategories, ["103"], 1, [1]).map((candidate) => candidate.id),
      ["dds-103-fire"],
    );
  });

  it("для оператора 112 — только карточки 112, звонки в пул не входят", () => {
    assert.deepEqual(
      proceduralPool(templates, [null], 4, []).map((candidate) => candidate.id),
      ["card-112"],
    );
  });
});

describe("черновик процедурного сценария", () => {
  it("одна служба — индивидуальное место, пул списком шаблонов, схема 3", () => {
    const pool = proceduralPool(templates, ["103"], 1, []);
    const draft = proceduralScenarioDraft({ name: "ТЕСТ процедурный 103", positions: ["103"], targetCount: 1, difficulty: 1 }, pool);
    const definition = definitionBody(draft, classify);

    assert.equal(draft.workspaceMode, "INDIVIDUAL");
    assert.deepEqual(draft.requiredPositions, ["103"]);
    assert.equal(definition.mode, "PROCEDURAL");
    assert.equal(definition.schema_version, 3);
    assert.deepEqual(definition.procedural_generation?.template_pool, { template_ids: ["dds-103"] });
  });

  it("несколько служб — общее место, участников столько же, сколько служб", () => {
    const draft = proceduralScenarioDraft(
      { name: "ТЕСТ процедурный 103 и 104", positions: ["103", "104"], targetCount: 2, difficulty: 1 },
      proceduralPool(templates, ["103", "104"], 1, []),
    );

    assert.equal(draft.workspaceMode, "SHARED");
    assert.equal(draft.minParticipants, 2);
    assert.equal(draft.maxParticipants, 2);
    assert.deepEqual(draft.requiredPositions, ["103", "104"]);
  });
});
