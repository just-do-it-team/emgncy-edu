import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scheduleBody, scheduleChangeBlock, scheduleTarget, scheduleTargetPath } from "./lesson-schedule.ts";

const NOW = Date.parse("2026-09-28T12:00:00+03:00");

describe("выбор ручки переноса и отмены", () => {
  it("занятие-пакет — ручка пакета, даже если назначение одно", () => {
    const target = scheduleTarget("batch-1", ["a1"]);

    assert.deepEqual(target, { kind: "batch", id: "batch-1" });
    assert.equal(target && scheduleTargetPath(target), "/assignment-batches/batch-1");
  });

  it("одиночное назначение без пакета — ручка назначения", () => {
    const target = scheduleTarget(null, ["a1"]);

    assert.deepEqual(target, { kind: "assignment", id: "a1" });
    assert.equal(target && scheduleTargetPath(target), "/scenario-assignments/a1");
  });

  it("несколько назначений без пакета — менять нечем", () => {
    assert.equal(scheduleTarget(null, ["a1", "a2"]), null);
  });
});

describe("когда перенос и отмена недоступны", () => {
  it("есть попытки", () => {
    assert.match(scheduleChangeBlock(["ASSIGNED"], 1) ?? "", /уже есть попытки/);
  });

  it("занятие идёт или завершено", () => {
    assert.match(scheduleChangeBlock(["RUNNING"], 0) ?? "", /уже началось/);
    assert.match(scheduleChangeBlock(["ASSIGNED", "COMPLETED"], 0) ?? "", /уже началось/);
  });

  it("отменено", () => {
    assert.equal(scheduleChangeBlock(["CANCELLED"], 0), "Занятие уже отменено.");
  });

  it("назначено или просрочено без попыток — можно", () => {
    assert.equal(scheduleChangeBlock(["ASSIGNED", "EXPIRED"], 0), null);
  });
});

describe("тело переноса", () => {
  it("пустое начало — сейчас, пустой срок — через 7 дней от начала; обе даты явно", () => {
    assert.deepEqual(scheduleBody({ availableFrom: null, dueAt: null }, NOW), {
      available_from: new Date(NOW).toISOString(),
      due_at: new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
  });

  it("заданные даты уходят как есть", () => {
    assert.deepEqual(
      scheduleBody({ availableFrom: "2026-10-01T06:00:00.000Z", dueAt: "2026-10-03T15:00:00.000Z" }, NOW),
      { available_from: "2026-10-01T06:00:00.000Z", due_at: "2026-10-03T15:00:00.000Z" },
    );
  });
});
