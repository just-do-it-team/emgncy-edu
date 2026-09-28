import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkModeOf } from "./check-mode.ts";
import { difficultyLabel } from "./difficulty.ts";
import { scenarioRole } from "./scenario-role.ts";
import { triggerText } from "./trigger-text.ts";

describe("checkModeOf", () => {
  const expected = { description: "Дым из-под двери", location_phone_number: null, victims_count: 0 };

  it("значение задано — проверяется при любом источнике", () => {
    assert.equal(checkModeOf("INLINE", expected, "description"), "checked");
    assert.equal(checkModeOf("TEMPLATE", expected, "description"), "checked");
  });

  it("ноль и пустая строка — это значения, их сервер сравнивает", () => {
    assert.equal(checkModeOf("TEMPLATE", expected, "victims_count"), "checked");
    assert.equal(checkModeOf("INLINE", { reported_address: "" }, "reported_address"), "checked");
  });

  it("null во встроенной карточке не проверяется", () => {
    assert.equal(checkModeOf("INLINE", expected, "location_phone_number"), "not_checked");
  });

  it("null в шаблоне означает, что поле должно остаться пустым", () => {
    assert.equal(checkModeOf("TEMPLATE", expected, "location_phone_number"), "must_be_empty");
  });

  it("поля нет в эталоне — не проверяется", () => {
    assert.equal(checkModeOf("INLINE", expected, "applicant_full_name"), "not_checked");
    assert.equal(checkModeOf("TEMPLATE", expected, "applicant_full_name"), "not_checked");
  });
});

describe("scenarioRole", () => {
  it("только звонки — оператор 112", () => {
    assert.equal(scenarioRole({ itemTypes: ["INCOMING_CALL", "INCOMING_CALL"], procedural: false }), "OPERATOR_112");
  });

  it("только карточки — диспетчер ДДС", () => {
    assert.equal(scenarioRole({ itemTypes: ["INCIDENT_CARD"], procedural: false }), "DDS");
  });

  it("процедурная подача без элементов — ДДС", () => {
    assert.equal(scenarioRole({ itemTypes: [], procedural: true }), "DDS");
  });

  it("звонки и карточки — смешанный", () => {
    assert.equal(scenarioRole({ itemTypes: ["INCOMING_CALL", "INCIDENT_CARD"], procedural: false }), "MIXED");
    assert.equal(scenarioRole({ itemTypes: ["INCOMING_CALL"], procedural: true }), "MIXED");
  });

  it("пустой состав — роль не определена", () => {
    assert.equal(scenarioRole({ itemTypes: [], procedural: false }), null);
  });
});

describe("triggerText", () => {
  const itemLabel = (key: string) => (key === "call-1" ? "Звонок 1" : key);
  const actionLabel = (code: string) => (code === "INCOMING_CALL_COMPLETED" ? "вызов завершён" : null);

  it("смещение 0 — сразу", () => {
    assert.equal(triggerText({ type: "TIME_OFFSET", offsetSeconds: 0 }, itemLabel, actionLabel), "сразу");
  });

  it("смещение — через N с", () => {
    assert.equal(triggerText({ type: "TIME_OFFSET", offsetSeconds: 90 }, itemLabel, actionLabel), "через 90 с");
  });

  it("после действия с задержкой — название действия и элемента", () => {
    assert.equal(
      triggerText(
        { type: "AFTER_ACTION", itemKey: "call-1", actionType: "INCOMING_CALL_COMPLETED", delaySeconds: 45 },
        itemLabel,
        actionLabel,
      ),
      "после действия «вызов завершён» по элементу «Звонок 1», через 45 с",
    );
  });

  it("после действия без задержки — сразу", () => {
    assert.equal(
      triggerText(
        { type: "AFTER_ACTION", itemKey: "call-1", actionType: "INCOMING_CALL_COMPLETED", delaySeconds: 0 },
        itemLabel,
        actionLabel,
      ),
      "после действия «вызов завершён» по элементу «Звонок 1», сразу",
    );
  });

  it("неизвестное действие — код с пометкой", () => {
    assert.equal(
      triggerText(
        { type: "AFTER_ACTION", itemKey: "call-1", actionType: "CARD_SENT", delaySeconds: 0 },
        itemLabel,
        actionLabel,
      ),
      "после действия «CARD_SENT (названия нет)» по элементу «Звонок 1», сразу",
    );
  });

  it("условия нет — так и сказано", () => {
    assert.equal(triggerText(null, itemLabel, actionLabel), "условие подачи не задано");
  });
});

describe("difficultyLabel", () => {
  it("четыре уровня по порядку", () => {
    assert.deepEqual([1, 2, 3, 4].map(difficultyLabel), ["Простой", "Средний", "Сложный", "Сверхсложный"]);
  });

  it("5 со старых данных — сверхсложный", () => {
    assert.equal(difficultyLabel(5), "Сверхсложный");
  });
});
