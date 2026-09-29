import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backtest, forecastScore, lessonSeries, studentForecast } from "./forecast.ts";
import {
  difficultyAdviceOf,
  leadersAndLaggards,
  readinessOf,
  studentStats,
  trendOf,
  type AnalyticsColumn,
  type AttemptFacts,
  type NormFacts,
} from "./student-stats.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const START = Date.parse("2026-09-01T10:00:00+03:00");

function norms(onTimeShare: number): NormFacts {
  const total = 10;
  const onTime = Math.round(total * onTimeShare);

  return { opens: total, opensOnTime: onTime, entries: total, entriesOnTime: onTime, openMs: [], entryMs: [] };
}

function attempt(studentId: string, index: number, score: number, overrides: Partial<AttemptFacts> = {}): AttemptFacts {
  return {
    sessionId: `${studentId}-${index}`,
    studentId,
    studentName: `Обучаемый ${studentId}`,
    groupName: "УМЦ-112, группа 4",
    lessonKey: `lesson-${index}`,
    completedAt: new Date(START + index * DAY_MS).toISOString(),
    score,
    passed: score >= 70,
    passingScore: 70,
    difficulty: 2,
    role: "DDS",
    errors: null,
    norms: norms(1),
    ...overrides,
  };
}

function errors(entries: [AnalyticsColumn, boolean][]): Map<AnalyticsColumn, boolean> {
  return new Map(entries);
}

describe("готовность", () => {
  it("высокий балл, всё зачтено, нормативы соблюдены — готов", () => {
    const history = [90, 92, 88, 95].map((score, index) => attempt("a", index, score));

    assert.equal(readinessOf(history)?.level, "ready");
  });

  it("хороший балл, но нормативы соблюдены в 80 % — уверенно, причина называет нормативы", () => {
    const history = [90, 92, 88].map((score, index) => attempt("a", index, score, { norms: norms(0.8) }));
    const verdict = readinessOf(history);

    assert.equal(verdict?.level, "confident");
    assert.match(verdict?.reason ?? "", /нормативы соблюдены в 80/);
  });

  it("низкий балл — нужна практика; у оператора 112 нормативы не учитываются", () => {
    assert.equal(readinessOf([50, 60].map((score, index) => attempt("a", index, score)))?.level, "practice");
    assert.equal(
      readinessOf([90, 95].map((score, index) => attempt("a", index, score, { role: "OPERATOR_112", norms: null })))?.level,
      "ready",
    );
  });

  it("без оценённых попыток статуса нет", () => {
    assert.equal(readinessOf([attempt("a", 0, 0, { score: null, passed: null })]), null);
  });
});

describe("рекомендуемая сложность", () => {
  it("три зачтённые подряд со средним от 85 — повысить", () => {
    const verdict = difficultyAdviceOf([86, 90, 88].map((score, index) => attempt("a", index, score)));

    assert.deepEqual([verdict?.advice, verdict?.next], ["raise", 3]);
  });

  it("двух удачных попыток мало для повышения — оставить", () => {
    assert.equal(difficultyAdviceOf([95, 95].map((score, index) => attempt("a", index, score)))?.advice, "keep");
  });

  it("зачтено меньше половины — понизить; окно только по текущей сложности", () => {
    const history = [
      attempt("a", 0, 95, { difficulty: 1 }),
      attempt("a", 1, 50),
      attempt("a", 2, 55),
      attempt("a", 3, 80),
    ];

    assert.deepEqual([difficultyAdviceOf(history)?.advice, difficultyAdviceOf(history)?.next], ["lower", 1]);
  });

  it("на минимальной сложности не понижает", () => {
    assert.equal(difficultyAdviceOf([40, 30].map((score, index) => attempt("a", index, score, { difficulty: 1 })))?.advice, "keep");
  });
});

describe("тренд, лидеры и отстающие", () => {
  it("тренд — последние три против предыдущих", () => {
    assert.equal(trendOf([60, 60, 80, 80, 80].map((score, index) => attempt("a", index, score))), 20);
    assert.equal(trendOf([60, 80].map((score, index) => attempt("a", index, score))), null);
  });

  it("лидеры — с сильными сторонами, отстающие — с двумя главными ошибками", () => {
    const clean = errors([
      ["C2", false],
      ["C7", false],
    ]);
    const weak = errors([
      ["C2", true],
      ["C5", true],
      ["C7", false],
    ]);
    const facts = [
      ...[95, 90].map((score, index) => attempt("best", index, score, { errors: clean })),
      ...[85, 80].map((score, index) => attempt("good", index, score, { errors: clean })),
      ...[75, 70].map((score, index) => attempt("mid", index, score, { errors: clean })),
      ...[40, 50].map((score, index) => attempt("weak", index, score, { errors: weak })),
      attempt("single", 0, 10),
    ];
    const { leaders, laggards } = leadersAndLaggards(studentStats(facts));

    assert.deepEqual(
      leaders.map((leader) => leader.stats.studentId),
      ["best", "good"],
    );
    assert.match(leaders[0]?.text ?? "", /без ошибок: Службы, Статусы реагирования/);
    assert.deepEqual(
      laggards.map((laggard) => laggard.stats.studentId),
      ["weak", "mid"],
    );
    assert.match(laggards[0]?.text ?? "", /ошибается: Службы \(2 из 2\), Тайминг \(2 из 2\)/);
  });
});

describe("прогноз", () => {
  it("растущий ряд — прогноз выше последнего балла, интервал вокруг прогноза", () => {
    const forecast = forecastScore([60, 65, 70, 75, 80]);

    assert.ok(forecast !== null && forecast.expected > 80);
    assert.ok(forecast !== null && forecast.low < forecast.expected && forecast.high > forecast.expected);
  });

  it("одно занятие — прогноз равен баллу, интервал широкий; прогноз не выходит за шкалу", () => {
    assert.deepEqual(forecastScore([80]), { expected: 80, low: 65, high: 95 });
    assert.equal(forecastScore([90, 95, 100, 100])?.expected, 100);
  });

  it("балл занятия — среднее попыток этого занятия", () => {
    const series = lessonSeries([attempt("a", 0, 60), attempt("a", 0, 80), attempt("a", 1, 90)]);

    assert.deepEqual(
      series.map((point) => point.score),
      [70, 90],
    );
  });

  it("зона риска — ожидаемый балл ниже порога или нормативы реже половины случаев", () => {
    assert.equal(studentForecast([50, 55].map((score, index) => attempt("a", index, score))).atRisk, true);
    assert.equal(studentForecast([90, 95].map((score, index) => attempt("a", index, score))).atRisk, false);
    assert.match(
      studentForecast([90, 95].map((score, index) => attempt("a", index, score, { norms: norms(0.3) }))).riskReason ?? "",
      /нормативы/,
    );
  });
});

describe("прогноз ↔ факт на синтетической истории", () => {
  it("пары только по прошлым занятиям; на ровном росте метод точнее наивного среднего", () => {
    const growing = [50, 58, 66, 74, 82, 90].map((score, index) => attempt("growing", index, score));
    const summary = backtest(new Map([["growing", growing]]));

    assert.equal(summary.pairs.length, 5);
    assert.equal(summary.pairs[0]?.predicted, 50);
    assert.ok((summary.meanAbsoluteError ?? Infinity) < (summary.naiveMeanAbsoluteError ?? 0));
    assert.equal(summary.reliable, false);
  });

  it("доля попаданий в интервал и порог надёжности по числу пар", () => {
    const flat = new Map(
      ["a", "b", "c"].map((studentId) => [studentId, [80, 80, 80, 80, 80].map((score, index) => attempt(studentId, index, score))]),
    );
    const summary = backtest(flat);

    assert.equal(summary.pairs.length, 12);
    assert.equal(summary.meanAbsoluteError, 0);
    assert.equal(summary.coverage, 1);
    assert.equal(summary.reliable, true);
  });

  it("без повторных занятий пар нет", () => {
    const summary = backtest(new Map([["a", [attempt("a", 0, 80)]]]));

    assert.deepEqual([summary.pairs.length, summary.meanAbsoluteError, summary.coverage], [0, null, null]);
  });
});
