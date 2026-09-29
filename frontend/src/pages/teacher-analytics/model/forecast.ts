import {
  MAX_SCORE,
  MIN_INTERVAL_HALF_WIDTH,
  RELIABLE_BACKTEST_PAIRS,
  RISK_NORM_SHARE,
  SINGLE_POINT_HALF_WIDTH,
  SMOOTHING_LEVEL,
  SMOOTHING_TREND,
} from "./analytics-rules.ts";
import { normShareOf, type AttemptFacts } from "./student-stats.ts";

export interface LessonPoint {
  lessonKey: string;
  at: number;
  score: number;
}

export interface Forecast {
  expected: number;
  low: number;
  high: number;
}

export interface StudentForecast {
  forecast: Forecast | null;
  passingScore: number | null;
  normShare: number | null;
  atRisk: boolean;
  riskReason: string | null;
}

export interface BacktestPair {
  studentId: string;
  lessonKey: string;
  predicted: number;
  naive: number;
  actual: number;
  low: number;
  high: number;
}

export interface BacktestSummary {
  pairs: BacktestPair[];
  meanAbsoluteError: number | null;
  naiveMeanAbsoluteError: number | null;
  coverage: number | null;
  reliable: boolean;
}

function clampScore(value: number): number {
  return Math.min(MAX_SCORE, Math.max(0, value));
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Балл за занятие — средний итоговый балл попыток обучаемого в этом занятии; порядок — по первой попытке. */
export function lessonSeries(attempts: AttemptFacts[]): LessonPoint[] {
  const lessons = new Map<string, { at: number; scores: number[] }>();

  for (const attempt of attempts) {
    if (attempt.score === null) continue;

    const at = Date.parse(attempt.completedAt);
    const lesson = lessons.get(attempt.lessonKey) ?? { at, scores: [] };

    lessons.set(attempt.lessonKey, { at: Math.min(lesson.at, at), scores: [...lesson.scores, attempt.score] });
  }

  return [...lessons]
    .map(([lessonKey, { at, scores }]) => ({ lessonKey, at, score: mean(scores) }))
    .sort((first, second) => first.at - second.at);
}

/**
 * Прогноз балла на следующее занятие — экспоненциальное сглаживание с трендом (метод Хольта):
 * уровень сглаживает баллы по занятиям, тренд — изменения уровня. Интервал — разброс баллов
 * вокруг уровня (стандартное отклонение), но не уже минимального; по одному занятию тренда нет,
 * поэтому интервал берётся широким.
 */
export function forecastScore(scores: number[]): Forecast | null {
  const [first, ...rest] = scores;

  if (first === undefined) return null;
  if (rest.length === 0) {
    return { expected: first, low: clampScore(first - SINGLE_POINT_HALF_WIDTH), high: clampScore(first + SINGLE_POINT_HALF_WIDTH) };
  }

  let level = first;
  let trend = (rest[0] ?? first) - first;

  for (const score of rest) {
    const previous = level;

    level = SMOOTHING_LEVEL * score + (1 - SMOOTHING_LEVEL) * (level + trend);
    trend = SMOOTHING_TREND * (level - previous) + (1 - SMOOTHING_TREND) * trend;
  }

  const average = mean(scores);
  const deviation = Math.sqrt(mean(scores.map((score) => (score - average) ** 2)));
  const halfWidth = Math.max(MIN_INTERVAL_HALF_WIDTH, deviation);
  const expected = clampScore(level + trend);

  return { expected, low: clampScore(expected - halfWidth), high: clampScore(expected + halfWidth) };
}

/** Зона риска: ожидаемый балл ниже порога зачёта или нормативы соблюдаются реже чем в половине случаев. */
export function studentForecast(attempts: AttemptFacts[]): StudentForecast {
  const forecast = forecastScore(lessonSeries(attempts).map((point) => point.score));
  const passingScore = attempts.at(-1)?.passingScore ?? null;
  const normShare = normShareOf(attempts);
  const belowPass = forecast !== null && passingScore !== null && forecast.expected < passingScore;
  const slowNorms = normShare !== null && normShare < RISK_NORM_SHARE;
  const reasons = [
    belowPass ? "ожидаемый балл ниже порога зачёта" : null,
    slowNorms ? "нормативы соблюдаются реже чем в половине случаев" : null,
  ].filter((reason): reason is string => reason !== null);

  return {
    forecast,
    passingScore,
    normShare,
    atRisk: reasons.length > 0,
    riskReason: reasons.length === 0 ? null : reasons.join("; "),
  };
}

/**
 * Честная проверка на истории: для каждого занятия, кроме первого, прогноз строится только по
 * предыдущим занятиям обучаемого и сравнивается с фактическим баллом. Для сравнения тот же расчёт
 * делается «наивным» прогнозом — средним прошлых баллов.
 */
export function backtest(histories: Map<string, AttemptFacts[]>): BacktestSummary {
  const pairs = [...histories].flatMap(([studentId, attempts]) => {
    const series = lessonSeries(attempts);

    return series.slice(1).flatMap((point, index) => {
      const past = series.slice(0, index + 1).map((previous) => previous.score);
      const forecast = forecastScore(past);

      return forecast === null
        ? []
        : [
            {
              studentId,
              lessonKey: point.lessonKey,
              predicted: forecast.expected,
              naive: mean(past),
              actual: point.score,
              low: forecast.low,
              high: forecast.high,
            },
          ];
    });
  });

  if (pairs.length === 0) {
    return { pairs, meanAbsoluteError: null, naiveMeanAbsoluteError: null, coverage: null, reliable: false };
  }

  return {
    pairs,
    meanAbsoluteError: mean(pairs.map((pair) => Math.abs(pair.predicted - pair.actual))),
    naiveMeanAbsoluteError: mean(pairs.map((pair) => Math.abs(pair.naive - pair.actual))),
    coverage: pairs.filter((pair) => pair.actual >= pair.low && pair.actual <= pair.high).length / pairs.length,
    reliable: pairs.length >= RELIABLE_BACKTEST_PAIRS,
  };
}
