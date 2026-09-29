import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScenarioTemplate } from "@/shared/api";
import { CARD_FROM_CALL_ACTION, scenarioDraftFromTemplates } from "./generated-scenario.ts";
import { draftUpdateRequest, publishBlock, templateReviewProgress } from "./template-review.ts";

function template(id: string, kind: ScenarioTemplate["kind"], overrides: Partial<ScenarioTemplate> = {}): ScenarioTemplate {
  return {
    id,
    templateKey: `key-${id}`,
    kind,
    variant: kind === "call" ? "call" : "cardDds",
    version: 1,
    name: `Шаблон ${id}`,
    description: null,
    difficulty: 1,
    status: "DRAFT",
    generatedByAi: true,
    aiReviewState: null,
    generationId: "gen-1",
    isActive: true,
    createdBy: "teacher",
    createdByName: null,
    createdAt: "2026-09-28T10:00:00+03:00",
    initialCard: null,
    initialCall: null,
    expectedResult: {},
    recordId: 1050101,
    services: ["101"],
    ...overrides,
  };
}

describe("проверка черновика ИИ по секциям", () => {
  it("публикация закрыта, пока не все секции подтверждены или исправлены", () => {
    const card = template("c1", "card", {
      aiReviewState: { classification: "CONFIRMED", incident_details: "EDITED", routing: "REJECTED" },
    });

    assert.deepEqual(templateReviewProgress(card), {
      done: 2,
      total: 5,
      pending: ["routing", "response_statuses", "outbound_call"],
      rejected: ["routing"],
    });
    assert.match(publishBlock(card) ?? "", /Проверено 2 из 5.*исправьте в редакторе черновика: Службы/);
  });

  it("у шаблона звонка свои секции; все подтверждены — публиковать можно", () => {
    const call = template("t1", "call", {
      aiReviewState: { classification: "CONFIRMED", incident_details: "CONFIRMED", contacts: "EDITED", routing: "CONFIRMED" },
    });

    assert.equal(templateReviewProgress(call).total, 4);
    assert.equal(publishBlock(call), null);
  });

  it("опубликованный и не сгенерированный шаблон не блокируется", () => {
    assert.equal(publishBlock(template("c2", "card", { status: "PUBLISHED" })), null);
    assert.equal(publishBlock(template("c3", "card", { generatedByAi: false })), null);
  });
});

describe("сценарий из сгенерированных шаблонов", () => {
  it("звонок 112 первым, карточки ДДС — после создания карточки из вызова; общее место на все позиции", () => {
    const draft = scenarioDraftFromTemplates(
      template("t1", "call", { difficulty: 2 }),
      [template("c1", "card", { difficulty: 3 }), template("c2", "card")],
      ["101", "103"],
    );

    assert.deepEqual(
      draft.items.map((item) => [item.key, item.itemType, item.trigger.kind]),
      [
        ["call-1", "INCOMING_CALL", "immediate"],
        ["card-1", "INCIDENT_CARD", "after"],
        ["card-2", "INCIDENT_CARD", "after"],
      ],
    );
    assert.deepEqual(draft.items[1]?.trigger, { kind: "after", itemKey: "call-1", actionType: CARD_FROM_CALL_ACTION, delaySeconds: 0 });
    assert.equal(draft.workspaceMode, "SHARED");
    assert.deepEqual(draft.requiredPositions, [null, "101", "103"]);
    assert.equal(draft.minParticipants, 3);
    assert.equal(draft.difficulty, 3);
  });
});

describe("правка черновика ИИ", () => {
  it("PATCH несёт содержимое и отмечает исправленными только выбранные секции", () => {
    const request = draftUpdateRequest(
      "c1",
      {
        kind: "card",
        body: {
          template_key: null,
          version: 1,
          name: "Пожар: квартира — ДДС 101",
          description: null,
          difficulty: 2,
          expected_result: { card: { services: ["101"] } },
          created_by: "teacher",
          initial_card: { description: "Дым из окна" },
        },
      },
      "teacher",
      ["routing"],
    );

    assert.deepEqual(request, {
      kind: "card",
      templateId: "c1",
      body: {
        updated_by: "teacher",
        review_decisions: { routing: "EDITED" },
        status: null,
        name: "Пожар: квартира — ДДС 101",
        description: null,
        difficulty: 2,
        expected_result: { card: { services: ["101"] } },
        initial_card: { description: "Дым из окна" },
      },
    });
  });
});
