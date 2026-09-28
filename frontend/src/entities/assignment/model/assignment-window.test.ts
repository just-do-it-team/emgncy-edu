import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignmentWindow, assignmentWindowProblem } from "./assignment-window.ts";

const NOW = Date.parse("2026-09-28T12:00:00+03:00");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("окно назначения", () => {
  it("без дат: начало — сейчас, срок — через 7 дней, как на сервере", () => {
    assert.deepEqual(assignmentWindow(null, null, NOW), { start: NOW, due: NOW + 7 * DAY_MS });
  });

  it("только начало: срок — через 7 дней от начала", () => {
    const start = "2026-10-01T09:00:00+03:00";

    assert.equal(assignmentWindow(start, null, NOW).due, Date.parse(start) + 7 * DAY_MS);
  });

  it("срок не позже начала — ошибка", () => {
    assert.equal(
      assignmentWindowProblem("2026-10-01T09:00:00+03:00", "2026-10-01T08:00:00+03:00", NOW),
      "Срок должен быть позже начала.",
    );
  });

  it("только срок в прошлом — ошибка: начало без даты — это сейчас", () => {
    assert.match(assignmentWindowProblem(null, "2026-09-27T09:00:00+03:00", NOW) ?? "", /позже текущего момента/);
  });

  it("обе даты в прошлом — срок прошёл", () => {
    assert.match(
      assignmentWindowProblem("2026-09-20T09:00:00+03:00", "2026-09-21T09:00:00+03:00", NOW) ?? "",
      /уже прошёл/,
    );
  });

  it("корректное окно — без ошибок", () => {
    assert.equal(assignmentWindowProblem(null, "2026-10-05T18:00:00+03:00", NOW), null);
  });
});
