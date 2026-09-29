import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreTrend, topCriteria } from "./my-results.ts";

describe("мои результаты", () => {
  it("динамика — последние три против предыдущих; при малой истории её нет", () => {
    assert.equal(scoreTrend([50, 60, 80, 80, 80]), 25);
    assert.equal(scoreTrend([50, 60, 70]), null);
  });

  it("главные ошибки — группы проверок по числу попыток с ошибкой, повтор в попытке считается один раз, при равенстве — по коду", () => {
    assert.deepEqual(topCriteria([["C4", "C4", "C2"], ["C4"], ["C7", "C2"], ["C1"]]), [
      { code: "C2", attempts: 2 },
      { code: "C4", attempts: 2 },
      { code: "C1", attempts: 1 },
    ]);
  });
});
