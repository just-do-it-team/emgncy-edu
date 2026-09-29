import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JsonObject, MonitoredSession, TrainingActionDto } from "@/shared/api";
import {
  alarmFeed,
  byProblem,
  fillTimes,
  normCompliance,
  participantRow,
  pollingDelay,
  timerLevel,
  type MonitorNorms,
  type ParticipantInput,
  type ParticipantRow,
} from "./lesson-monitor.ts";

const norms: MonitorNorms = { openMs: 30_000, firstEntryMs: 180_000, idleMs: 120_000, warningRatio: 0.7 };
const start = Date.parse("2026-09-28T10:00:00+03:00");
const userId = "4f6b8d0a-2c4e-4a6b-8d0f-6b8d0f2a4c85";
const serviceId = "3f8a1c5e-7b2d-4a96-8e0f-5c7a9e1b3d4f";
const otherServiceId = "4a9b2d6f-8c3e-4ba7-9f1a-6d8b0f2c4e5a";
const cardId = "5e7a9c1b-3d5f-4a8c-9e0b-2d4f6a8c0e17";

const at = (seconds: number) => new Date(start + seconds * 1000).toISOString();

function session(fields: Partial<MonitoredSession> = {}): MonitoredSession {
  return {
    sessionId: "3e5a7c9b-1d3f-4b5a-8c7e-9f1b3d5a7c20",
    assignmentId: "b1d3f5a7-9c2e-4a6b-8d0f-2e4a6c8e0b35",
    batchId: "5c7e9a1b-3d5f-4a8c-8e0a-2c4e6a8c0e19",
    groupName: "УМЦ-112, группа 4",
    scenarioName: "Пожар в жилом доме — ДДС 101",
    workspaceId: "f3d5b7a9-2c4e-4a6b-9d8f-0e1c3a5b7d92",
    status: "RUNNING",
    attemptNumber: 1,
    startedAt: at(0),
    completedAt: null,
    score: null,
    passed: null,
    automaticScore: null,
    automaticPassed: null,
    teacherAssessed: false,
    lastActivityAt: null,
    participants: [{ userId, displayName: "Белова Ксения Андреевна", role: "DDS", positionCode: "101" }],
    ...fields,
  };
}

let sequence = 0;

function action(seconds: number, actionType: string, fields: Partial<TrainingActionDto> = {}, details: JsonObject = {}): TrainingActionDto {
  sequence += 1;

  return {
    id: `action-${sequence}`,
    training_session_id: "3e5a7c9b-1d3f-4b5a-8c7e-9f1b3d5a7c20",
    workspace_id: "f3d5b7a9-2c4e-4a6b-9d8f-0e1c3a5b7d92",
    actor_user_id: userId,
    incident_card_id: cardId,
    action_type: actionType,
    entity_type: "card_service",
    entity_id: null,
    occurred_at: at(seconds),
    result: "SUCCESS",
    before_state: null,
    after_state: null,
    details,
    ...fields,
  };
}

const released = action(10, "CARD_RELEASED", { actor_user_id: null, entity_type: "incident_card" });

function input(actions: TrainingActionDto[], fields: Partial<ParticipantInput> = {}): ParticipantInput {
  return {
    participant: { userId, name: "Белова Ксения Андреевна", role: "DDS", positionCode: "101" },
    session: session(),
    actions,
    serviceId,
    soleDispatcher: true,
    ...fields,
  };
}

const kindsOf = (row: ParticipantRow) =>
  row.alarms.filter((alarm) => alarm.kind !== "idle").map((alarm) => alarm.kind).sort();

describe("тревоги по нормативам", () => {
  it("открытие за 25 с и запись со статусом и текстом за 2 мин — нарушений нет", () => {
    const row = participantRow(
      input([
        released,
        action(35, "CARD_OPENED", {}, { service_id: serviceId }),
        action(130, "CARD_ACCEPTED", {}, { service_id: serviceId, comment: "Выслан расчёт ПСЧ-12" }),
      ]),
      start + 150_000,
      norms,
    );

    assert.deepEqual(kindsOf(row), []);
    assert.equal(row.violations, 0);
  });

  it("карточка не открыта через 31 с — средний уровень, время тревоги — истечение норматива", () => {
    const row = participantRow(input([released]), start + 41_000, norms);
    const [alarm] = row.alarms;

    assert.equal(alarm?.kind, "open_norm");
    assert.equal(alarm?.severity, "medium");
    assert.equal(alarm?.at, start + 40_000);
    assert.equal(alarm?.elementLabel, "Карточка 1");
  });

  it("решение без текста не считается первой записью: через 3 мин — высокий уровень", () => {
    const row = participantRow(
      input([
        released,
        action(20, "CARD_OPENED", {}, { service_id: serviceId }),
        action(60, "CARD_ACCEPTED", {}, { service_id: serviceId, comment: "  " }),
      ]),
      start + 191_000,
      norms,
    );

    assert.deepEqual(kindsOf(row), ["first_entry_norm"]);
    assert.equal(row.alarms[0]?.severity, "high");
  });

  it("запись с опозданием остаётся нарушением после выполнения", () => {
    const row = participantRow(
      input([
        released,
        action(50, "CARD_OPENED", {}, { service_id: serviceId }),
        action(200, "SERVICE_STATUS_CHANGED", {}, { service_id: serviceId, status: "ACCEPTED", comment: "Принято" }),
      ]),
      start + 210_000,
      norms,
    );

    assert.deepEqual(kindsOf(row), ["first_entry_norm", "open_norm"]);
    assert.match(row.alarms[0]?.detail ?? "", /с опозданием/);
  });

  it("действия другой службы не закрывают норматив и не относят карточку к обучаемому", () => {
    const foreign = [released, action(15, "CARD_OPEN_DEADLINE_MISSED", { actor_user_id: null }, { service_id: otherServiceId })];

    assert.deepEqual(kindsOf(participantRow(input(foreign), start + 60_000, norms)), []);
    assert.deepEqual(
      kindsOf(participantRow(input([...foreign, action(12, "CARD_OPENED", { actor_user_id: null }, { service_id: serviceId })]), start + 250_000, norms)),
      ["first_entry_norm"],
    );
  });

  it("у оператора 112 нормативов реакции нет", () => {
    const row = participantRow(
      input([released], {
        participant: { userId, name: "Белова Ксения Андреевна", role: "OPERATOR_112", positionCode: null },
        serviceId: null,
      }),
      start + 400_000,
      norms,
    );

    assert.equal(row.violations, 0);
    assert.equal(row.timer?.level, "none");
  });

  it("попытка завершилась до истечения норматива — нарушения нет", () => {
    const row = participantRow(
      input([released], { session: session({ status: "COMPLETED", completedAt: at(25) }) }),
      start + 500_000,
      norms,
    );

    assert.equal(row.violations, 0);
  });
});

describe("бездействие и прерывание", () => {
  it("нет своих действий 2 мин — низкий уровень, отсчёт от последнего действия обучаемого", () => {
    const row = participantRow(
      input([released, action(20, "CARD_OPENED", {}, { service_id: serviceId }), action(40, "CARD_ACCEPTED", {}, { service_id: serviceId, comment: "Принято" })]),
      start + 161_000,
      norms,
    );
    const idle = row.alarms.find((alarm) => alarm.kind === "idle");

    assert.equal(idle?.severity, "low");
    assert.equal(idle?.at, start + 160_000);
    assert.equal(row.idleMs, 121_000);
  });

  it("без действий отсчёт идёт от начала попытки; у завершённой попытки бездействия нет", () => {
    assert.equal(participantRow(input([]), start + 119_000, norms).alarms.length, 0);
    assert.equal(participantRow(input([]), start + 121_000, norms).alarms[0]?.kind, "idle");
    assert.equal(
      participantRow(input([], { session: session({ status: "COMPLETED", completedAt: at(60) }) }), start + 900_000, norms).alarms.length,
      0,
    );
  });

  it("автопрерывание по потере связи — высокий уровень с причиной по-русски", () => {
    const row = participantRow(
      input([action(90, "SESSION_ABORTED", { actor_user_id: null }, { reason: "PRESENCE_TIMEOUT" })], {
        session: session({ status: "ABORTED", completedAt: at(90) }),
      }),
      start + 100_000,
      norms,
    );

    assert.equal(row.status, "aborted");
    assert.equal(row.alarms[0]?.severity, "high");
    assert.match(row.alarms[0]?.detail ?? "", /потеря связи/);
  });

  it("прерывание обучаемым и преподавателем различаются", () => {
    const bySelf = participantRow(
      input([action(90, "SESSION_ABORTED")], { session: session({ status: "ABORTED", completedAt: at(90) }) }),
      start + 100_000,
      norms,
    );
    const byTeacher = participantRow(
      input([action(90, "SESSION_ABORTED", { actor_user_id: "6a8c0e2b-4d6f-4a1c-9e3b-5d7f9b1d3f28" }, { reason: "Сбой гарнитуры" })], {
        session: session({ status: "ABORTED", completedAt: at(90) }),
      }),
      start + 100_000,
      norms,
    );

    assert.equal(bySelf.alarms[0]?.detail, "обучаемый прервал попытку");
    assert.equal(byTeacher.alarms[0]?.detail, "прервана преподавателем: Сбой гарнитуры");
  });

  it("лента — самые свежие сверху", () => {
    const first = participantRow(input([released]), start + 300_000, norms);
    const times = alarmFeed([first]).map((alarm) => alarm.at);

    assert.deepEqual(times, [...times].sort((a, b) => b - a));
  });
});

describe("таймер текущего элемента", () => {
  it("уровни: в норме, близко (70 %), просрочено", () => {
    assert.equal(timerLevel(20_000, 30_000, 0.7), "ok");
    assert.equal(timerLevel(21_000, 30_000, 0.7), "near");
    assert.equal(timerLevel(30_000, 30_000, 0.7), "near");
    assert.equal(timerLevel(30_001, 30_000, 0.7), "overdue");
    assert.equal(timerLevel(999_000, null, 0.7), "none");
  });

  it("до открытия — против 30 с, после открытия — против 3 мин от появления, после записи — без норматива", () => {
    const opened = action(20, "CARD_OPENED", {}, { service_id: serviceId });
    const entry = action(70, "CARD_ACCEPTED", {}, { service_id: serviceId, comment: "Принято" });

    assert.deepEqual(participantRow(input([released]), start + 32_000, norms).timer, {
      elementLabel: "Карточка 1",
      elapsedMs: 22_000,
      limitMs: 30_000,
      phase: "open",
      level: "near",
    });
    assert.equal(participantRow(input([released, opened]), start + 60_000, norms).timer?.phase, "first_entry");
    assert.equal(participantRow(input([released, opened]), start + 200_000, norms).timer?.level, "overdue");
    assert.equal(participantRow(input([released, opened, entry]), start + 400_000, norms).timer?.level, "none");
  });

  it("текущий элемент — последний незавершённый; завершённый звонок пропускается", () => {
    const call = "9d1f3b5a-7c9e-4b2d-8f4a-6c8e0a2b4d11";
    const row = participantRow(
      input([
        action(5, "INCOMING_CALL_RINGING", { entity_id: call, incident_card_id: null, actor_user_id: null }),
        released,
        action(40, "INCOMING_CALL_COMPLETED", { entity_id: call, incident_card_id: null }),
      ]),
      start + 45_000,
      norms,
    );

    assert.equal(row.timer?.elementLabel, "Карточка 1");
  });
});

describe("сортировка по проблемности", () => {
  const row = (name: string, fields: Partial<ParticipantRow>): ParticipantRow => ({
    userId: name,
    name,
    role: "DDS",
    positionCode: "101",
    session: null,
    status: "running",
    timer: null,
    actionCount: 0,
    lastActionAt: null,
    idleMs: 0,
    violations: 0,
    alarms: [],
    ...fields,
  });

  it("просрочка и бездействие наверх, затем нарушения, затем остальные идущие, прерванные, не начавшие, завершившие", () => {
    const rows = [
      row("Завершила", { status: "completed", idleMs: null }),
      row("Не начал", { status: "not_started", idleMs: null }),
      row("Идёт", {}),
      row("Прервана", { status: "aborted", idleMs: null }),
      row("Нарушение", { violations: 1 }),
      row("Бездействует", { idleMs: 150_000 }),
      row("Просрочка", { timer: { elementLabel: "Карточка 1", elapsedMs: 40_000, limitMs: 30_000, phase: "open", level: "overdue" } }),
    ];

    assert.deepEqual(
      [...rows].sort(byProblem(norms)).map((item) => item.name),
      ["Бездействует", "Просрочка", "Нарушение", "Идёт", "Прервана", "Не начал", "Завершила"],
    );
  });
});

describe("опрос", () => {
  it("пауза на скрытой вкладке и для неактивных попыток", () => {
    assert.equal(pollingDelay(5000, { hidden: false, active: true }), 5000);
    assert.equal(pollingDelay(5000, { hidden: true, active: true }), false);
    assert.equal(pollingDelay(10_000, { hidden: false, active: false }), false);
  });
});

describe("время заполнения карточки", () => {
  it("карточка ДДС — от выпуска до первой записи с текстом, против норматива 3 мин", () => {
    const times = fillTimes(
      input([
        released,
        action(20, "CARD_OPENED", {}, { service_id: serviceId }),
        action(40, "CARD_ACCEPTED", {}, { service_id: serviceId, comment: " " }),
        action(250, "SERVICE_STATUS_CHANGED", {}, { service_id: serviceId, status: "RESPONSE_STARTED", comment: "Бригада выехала" }),
      ]),
      norms,
    );

    assert.deepEqual(times, [{ label: "Карточка 1", ms: 240_000, normMs: 180_000 }]);
  });

  it("звонок 112 — от ответа до создания карточки, норматива нет; без первой записи времени нет", () => {
    const callId = "7c9e1a3b-5d7f-4b9a-8c2e-4f6a8c0e2b46";
    const call = (seconds: number, actionType: string) =>
      action(seconds, actionType, { incident_card_id: null, entity_type: "training_call", entity_id: callId });
    const times = fillTimes(
      input([call(0, "INCOMING_CALL_RINGING"), call(15, "INCOMING_CALL_ANSWERED"), call(135, "INCIDENT_CARD_CREATED_FROM_CALL"), released], {
        participant: { userId, name: "Иванов Валентин", role: "OPERATOR_112", positionCode: null },
        serviceId: null,
      }),
      norms,
    );

    assert.deepEqual(times, [{ label: "Звонок 1", ms: 120_000, normMs: null }]);
  });
});

describe("соблюдение нормативов по попытке", () => {
  it("по карточке две проверки; открыта вовремя, первая запись опоздала — одно нарушение", () => {
    const finished = session({ status: "COMPLETED", completedAt: at(600) });
    const result = normCompliance(
      input(
        [
          released,
          action(20, "CARD_OPENED", {}, { service_id: serviceId }),
          action(250, "CARD_ACCEPTED", {}, { service_id: serviceId, comment: "Принято, выслана бригада" }),
        ],
        { session: finished },
      ),
      start + 900_000,
      norms,
    );

    assert.deepEqual(result, { checks: 2, violations: 1 });
  });
});
