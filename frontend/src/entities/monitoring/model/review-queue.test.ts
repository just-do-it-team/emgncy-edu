import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MonitoredSession } from "@/shared/api";
import { nextPendingAttempt, reviewQueueState } from "./review-queue.ts";

function session(id: string, overrides: Partial<MonitoredSession> = {}): MonitoredSession {
  return {
    sessionId: id,
    assignmentId: `assignment-${id}`,
    batchId: "batch-1",
    groupName: "УМЦ-112, группа 4",
    scenarioName: "Запах газа в квартире",
    workspaceId: `workspace-${id}`,
    status: "COMPLETED",
    attemptNumber: 1,
    startedAt: "2026-09-28T10:00:00+03:00",
    completedAt: "2026-09-28T10:20:00+03:00",
    score: 80,
    passed: false,
    automaticScore: 80,
    automaticPassed: false,
    teacherAssessed: false,
    lastActivityAt: null,
    participants: [],
    ...overrides,
  };
}

describe("очередь проверки", () => {
  it("без оценки преподавателя — на проверке", () => {
    assert.equal(reviewQueueState(session("a")), "pending");
  });

  it("оценка совпала с автоматической — подтверждена", () => {
    assert.equal(reviewQueueState(session("a", { teacherAssessed: true, score: 80.004 })), "confirmed");
  });

  it("другой балл или другой зачёт — исправлена", () => {
    assert.equal(reviewQueueState(session("a", { teacherAssessed: true, score: 90 })), "corrected");
    assert.equal(reviewQueueState(session("a", { teacherAssessed: true, passed: true })), "corrected");
  });

  it("идущая и прерванная попытки в очередь не попадают", () => {
    assert.equal(reviewQueueState(session("a", { status: "RUNNING", completedAt: null })), null);
    assert.equal(reviewQueueState(session("a", { status: "ABORTED" })), null);
  });

  it("следующая на проверке — ранняя непроверенная попытка того же занятия", () => {
    const current = session("a", { teacherAssessed: true });
    const sessions = [
      current,
      session("late", { completedAt: "2026-09-28T11:00:00+03:00" }),
      session("early", { completedAt: "2026-09-28T10:30:00+03:00" }),
      session("checked", { teacherAssessed: true }),
      session("other-lesson", { batchId: "batch-2", completedAt: "2026-09-28T09:00:00+03:00" }),
    ];

    assert.equal(nextPendingAttempt(sessions, current)?.sessionId, "early");
    assert.equal(nextPendingAttempt([current], current), null);
  });
});
