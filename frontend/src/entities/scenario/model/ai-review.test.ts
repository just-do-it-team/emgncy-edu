import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aiApprovalBlock, aiReviewProgress, withItemChecked, type AiReview } from "./ai-review.ts";

const review: AiReview = {
  model: "gpt-oss-20b",
  generatedAt: "2026-09-28T10:15:03+03:00",
  suggestedDifficulty: 3,
  itemKeys: ["card-1", "card-2", "card-3"],
  checkedKeys: [],
};

const labels: Record<string, string> = { "card-1": "Карточка 1", "card-2": "Карточка 2", "card-3": "Карточка 3" };
const labelOf = (key: string) => labels[key] ?? key;
const present = ["card-1", "card-2", "card-3"];

describe("проверка эталона сгенерированного сценария", () => {
  it("утверждение закрыто, пока проверены не все элементы, с перечнем оставшихся", () => {
    const partial = withItemChecked(review, "card-1", true);

    assert.deepEqual(aiReviewProgress(partial, present), { checked: 1, total: 3, pendingKeys: ["card-2", "card-3"] });
    assert.match(aiApprovalBlock(partial, present, labelOf) ?? "", /проверено 1 из 3, осталось — Карточка 2, Карточка 3/);
  });

  it("все проверены — утверждение открыто; снятая отметка снова закрывает", () => {
    const full = present.reduce((current, key) => withItemChecked(current, key, true), review);

    assert.equal(aiApprovalBlock(full, present, labelOf), null);
    assert.notEqual(aiApprovalBlock(withItemChecked(full, "card-2", false), present, labelOf), null);
  });

  it("удалённый элемент не требует проверки, добавленный вручную — тоже", () => {
    const checked = withItemChecked(withItemChecked(review, "card-1", true), "card-2", true);

    assert.equal(aiApprovalBlock(checked, ["card-1", "card-2", "card-4"], labelOf), null);
  });

  it("сценарий не из ИИ не блокируется", () => {
    assert.equal(aiApprovalBlock(null, present, labelOf), null);
  });
});
