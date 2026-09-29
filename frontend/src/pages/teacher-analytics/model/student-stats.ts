import type { ParticipantRole } from "@/shared/api";
import {
  CONFIDENT_MIN_NORM_SHARE,
  CONFIDENT_MIN_PASS_SHARE,
  CONFIDENT_MIN_SCORE,
  DIFFICULTY_WINDOW,
  LOWER_MAX_SCORE,
  LOWER_PASS_SHARE,
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
  RAISE_MIN_SCORE,
  READINESS_WINDOW,
  READY_MIN_NORM_SHARE,
  READY_MIN_PASS_SHARE,
  READY_MIN_SCORE,
  TREND_WINDOW,
} from "./analytics-rules.ts";

export type AnalyticsColumn = "C1" | "C2" | "C3" | "C4" | "C5" | "C7" | "outbound";

export const analyticsColumns: AnalyticsColumn[] = ["C1", "C2", "C3", "C4", "C5", "C7", "outbound"];

export const analyticsColumnLabels: Record<AnalyticsColumn, string> = {
  C1: "Классификация",
  C2: "Службы",
  C3: "Полнота",
  C4: "Адрес",
  C5: "Тайминг",
  C7: "Статусы реагирования",
  outbound: "Доклад бригаде",
};

export interface NormFacts {
  opens: number;
  opensOnTime: number;
  entries: number;
  entriesOnTime: number;
  openMs: number[];
  entryMs: number[];
}

export interface AddressMismatch {
  expected: string;
  actual: string;
}

export interface ServiceCheck {
  incidentType: string;
  serviceCode: string;
  missed: boolean;
}

export type DispatchStage = "accepted" | "responseStarted" | "arrived" | "completed";

export interface StageTime {
  stage: DispatchStage;
  ms: number;
}

export interface AttemptFacts {
  sessionId: string;
  studentId: string;
  studentName: string;
  groupName: string | null;
  lessonKey: string;
  completedAt: string;
  score: number | null;
  passed: boolean | null;
  passingScore: number | null;
  difficulty: number | null;
  role: ParticipantRole;
  errors: Map<AnalyticsColumn, boolean> | null;
  norms: NormFacts | null;
  addressChecks: number;
  addressMismatches: AddressMismatch[];
  serviceChecks: ServiceCheck[];
  stageTimes: StageTime[];
  typedWords: string[];
}

export interface ColumnShare {
  applicable: number;
  withErrors: number;
}

export type Readiness = "ready" | "confident" | "practice";

export interface ReadinessVerdict {
  level: Readiness;
  reason: string;
}

export type DifficultyAdvice = "raise" | "keep" | "lower";

export interface DifficultyVerdict {
  advice: DifficultyAdvice;
  current: number;
  next: number;
  reason: string;
}

export interface StudentStats {
  studentId: string;
  name: string;
  groupName: string | null;
  attempts: AttemptFacts[];
  average: number | null;
  trend: number | null;
  passShare: number | null;
  normShare: number | null;
  columns: Map<AnalyticsColumn, ColumnShare>;
  mainError: { column: AnalyticsColumn; share: ColumnShare } | null;
  readiness: ReadinessVerdict | null;
  difficulty: DifficultyVerdict | null;
  lastSessionId: string;
}

export const readinessLabels: Record<Readiness, string> = {
  ready: "готов к самостоятельной работе",
  confident: "уверенно, есть поправки",
  practice: "нужна практика",
};

const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function scoresOf(attempts: AttemptFacts[]): number[] {
  return attempts.flatMap((attempt) => (attempt.score === null ? [] : [attempt.score]));
}

function passShareOf(attempts: AttemptFacts[]): number | null {
  const judged = attempts.filter((attempt) => attempt.passed !== null);

  return judged.length === 0 ? null : judged.filter((attempt) => attempt.passed).length / judged.length;
}

/** Доля соблюдённых нормативов: раскрытие за 30 с и первая запись за 3 мин считаются вместе. */
export function normShareOf(attempts: AttemptFacts[]): number | null {
  const totals = attempts.reduce(
    (sum, attempt) =>
      attempt.norms === null
        ? sum
        : {
            all: sum.all + attempt.norms.opens + attempt.norms.entries,
            onTime: sum.onTime + attempt.norms.opensOnTime + attempt.norms.entriesOnTime,
          },
    { all: 0, onTime: 0 },
  );

  return totals.all === 0 ? null : totals.onTime / totals.all;
}

/** Тренд: средний балл последних попыток минус средний балл всех предыдущих. */
export function trendOf(attempts: AttemptFacts[]): number | null {
  const scores = scoresOf(attempts);

  if (scores.length <= TREND_WINDOW) return null;

  const recent = mean(scores.slice(-TREND_WINDOW));
  const before = mean(scores.slice(0, -TREND_WINDOW));

  return recent === null || before === null ? null : recent - before;
}

export function columnShares(attempts: AttemptFacts[]): Map<AnalyticsColumn, ColumnShare> {
  return new Map(
    analyticsColumns.map((column) => {
      const applicable = attempts.filter((attempt) => attempt.errors?.has(column) ?? false);

      return [
        column,
        { applicable: applicable.length, withErrors: applicable.filter((attempt) => attempt.errors?.get(column)).length },
      ];
    }),
  );
}

export function topErrors(columns: Map<AnalyticsColumn, ColumnShare>, count: number): { column: AnalyticsColumn; share: ColumnShare }[] {
  return [...columns]
    .filter(([, share]) => share.withErrors > 0)
    .sort(([, first], [, second]) => second.withErrors / second.applicable - first.withErrors / first.applicable || second.withErrors - first.withErrors)
    .slice(0, count)
    .map(([column, share]) => ({ column, share }));
}

/**
 * Готовность по последним попыткам: средний итоговый балл, доля зачтённых и доля соблюдённых
 * нормативов. Все три условия уровня должны выполняться; норматив не учитывается, если у роли его
 * нет (оператор 112). Причина перечисляет фактические значения, чтобы статус можно было проверить.
 */
export function readinessOf(attempts: AttemptFacts[]): ReadinessVerdict | null {
  const window = attempts.slice(-READINESS_WINDOW);
  const average = mean(scoresOf(window));
  const passShare = passShareOf(window);
  const normShare = normShareOf(window);

  if (average === null || passShare === null) return null;

  const meets = (score: number, pass: number, norm: number) =>
    average >= score && passShare >= pass && (normShare === null || normShare >= norm);
  const facts = [
    `по ${window.length} последним попыткам: средний балл ${decimal.format(average)}`,
    `зачтено ${percent.format(passShare)}`,
    normShare === null ? "нормативов у роли нет" : `нормативы соблюдены в ${percent.format(normShare)} случаев`,
  ].join(", ");

  if (meets(READY_MIN_SCORE, READY_MIN_PASS_SHARE, READY_MIN_NORM_SHARE)) {
    return { level: "ready", reason: `${facts}. Порог: балл от ${READY_MIN_SCORE}, зачтено от ${percent.format(READY_MIN_PASS_SHARE)}, нормативы от ${percent.format(READY_MIN_NORM_SHARE)}.` };
  }
  if (meets(CONFIDENT_MIN_SCORE, CONFIDENT_MIN_PASS_SHARE, CONFIDENT_MIN_NORM_SHARE)) {
    return {
      level: "confident",
      reason: `${facts}. До «готов» нужно: балл от ${READY_MIN_SCORE}, зачтено от ${percent.format(READY_MIN_PASS_SHARE)}, нормативы от ${percent.format(READY_MIN_NORM_SHARE)}.`,
    };
  }

  return {
    level: "practice",
    reason: `${facts}. Для «уверенно» нужно: балл от ${CONFIDENT_MIN_SCORE}, зачтено от ${percent.format(CONFIDENT_MIN_PASS_SHARE)}, нормативы от ${percent.format(CONFIDENT_MIN_NORM_SHARE)}.`,
  };
}

/**
 * Сложность следующего занятия. Смотрим последние попытки на текущей сложности (сложности последней
 * попытки): все зачтены и средний балл высокий — повысить; зачтено меньше половины или средний балл
 * низкий — понизить; иначе оставить. Повышение требует полного окна, чтобы не повышать по одной удаче.
 */
export function difficultyAdviceOf(attempts: AttemptFacts[]): DifficultyVerdict | null {
  const current = attempts.at(-1)?.difficulty ?? null;

  if (current === null) return null;

  const window = attempts.filter((attempt) => attempt.difficulty === current).slice(-DIFFICULTY_WINDOW);
  const average = mean(scoresOf(window));
  const passShare = passShareOf(window);

  if (average === null || passShare === null) return null;

  const facts = `на сложности ${current} последних попыток ${window.length}, зачтено ${percent.format(passShare)}, средний балл ${decimal.format(average)}`;

  if (window.length === DIFFICULTY_WINDOW && passShare === 1 && average >= RAISE_MIN_SCORE && current < MAX_DIFFICULTY) {
    return { advice: "raise", current, next: current + 1, reason: `${facts}: все зачтены и балл от ${RAISE_MIN_SCORE}.` };
  }
  if ((passShare < LOWER_PASS_SHARE || average < LOWER_MAX_SCORE) && current > MIN_DIFFICULTY) {
    return {
      advice: "lower",
      current,
      next: current - 1,
      reason: `${facts}: зачтено меньше ${percent.format(LOWER_PASS_SHARE)} или балл ниже ${LOWER_MAX_SCORE}.`,
    };
  }

  return {
    advice: "keep",
    current,
    next: current,
    reason: `${facts}. Повышение — после ${DIFFICULTY_WINDOW} зачтённых подряд со средним от ${RAISE_MIN_SCORE}; понижение — если зачтено меньше половины или балл ниже ${LOWER_MAX_SCORE}.`,
  };
}

function byCompletion(first: AttemptFacts, second: AttemptFacts): number {
  return Date.parse(first.completedAt) - Date.parse(second.completedAt);
}

export function studentStats(facts: AttemptFacts[]): StudentStats[] {
  const byStudent = new Map<string, AttemptFacts[]>();

  for (const attempt of facts) byStudent.set(attempt.studentId, [...(byStudent.get(attempt.studentId) ?? []), attempt]);

  return [...byStudent.values()].flatMap((unsorted) => {
    const attempts = [...unsorted].sort(byCompletion);
    const last = attempts.at(-1);

    if (last === undefined) return [];

    const columns = columnShares(attempts);

    return [
      {
        studentId: last.studentId,
        name: last.studentName,
        groupName: last.groupName,
        attempts,
        average: mean(scoresOf(attempts)),
        trend: trendOf(attempts),
        passShare: passShareOf(attempts),
        normShare: normShareOf(attempts),
        columns,
        mainError: topErrors(columns, 1)[0] ?? null,
        readiness: readinessOf(attempts),
        difficulty: difficultyAdviceOf(attempts),
        lastSessionId: last.sessionId,
      },
    ];
  });
}
