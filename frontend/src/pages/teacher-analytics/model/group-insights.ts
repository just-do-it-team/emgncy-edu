import {
  analyticsColumnLabels,
  analyticsColumns,
  columnShares,
  normShareOf,
  type AnalyticsColumn,
  type AttemptFacts,
  type ColumnShare,
  type DispatchStage,
  type StudentStats,
} from "./student-stats.ts";

const TOP_EXAMPLES = 5;
const TOP_WORDS = 8;
const SIDES_COUNT = 2;
const SECOND_MS = 1000;

const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rate(share: ColumnShare): number {
  return share.applicable === 0 ? 0 : share.withErrors / share.applicable;
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / SECOND_MS));

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function misspelledIn(words: string[], misspelled: ReadonlyMap<string, string[]>): string[] {
  return words.filter((word) => misspelled.has(word));
}

export interface PeriodKpis {
  attempts: number;
  averageScore: number | null;
  passShare: number | null;
  normShare: number | null;
  spellingPerAttempt: number | null;
}

/**
 * Ключевые показатели периода. Орфография считается только по попыткам, где обучаемый вводил текст
 * сам, и только когда словарь уже проверил слова: иначе показатель неизвестен, а не нулевой.
 */
export function periodKpis(facts: AttemptFacts[], misspelled: ReadonlyMap<string, string[]> | null): PeriodKpis {
  const judged = facts.filter((attempt) => attempt.passed !== null);
  const typed = facts.filter((attempt) => attempt.typedWords.length > 0);

  return {
    attempts: facts.length,
    averageScore: mean(facts.flatMap((attempt) => (attempt.score === null ? [] : [attempt.score]))),
    passShare: judged.length === 0 ? null : judged.filter((attempt) => attempt.passed).length / judged.length,
    normShare: normShareOf(facts),
    spellingPerAttempt:
      misspelled === null || typed.length === 0
        ? null
        : typed.reduce((sum, attempt) => sum + misspelledIn(attempt.typedWords, misspelled).length, 0) / typed.length,
  };
}

export interface AddressExample {
  expected: string;
  actual: string;
  count: number;
}

export interface AddressSummary {
  checked: number;
  withErrors: number;
  examples: AddressExample[];
}

export function addressSummary(facts: AttemptFacts[]): AddressSummary {
  const checked = facts.filter((attempt) => attempt.addressChecks > 0);
  const examples = new Map<string, AddressExample>();

  for (const mismatch of checked.flatMap((attempt) => attempt.addressMismatches)) {
    const key = `${mismatch.expected}\n${mismatch.actual}`;
    const current = examples.get(key) ?? { ...mismatch, count: 0 };

    examples.set(key, { ...current, count: current.count + 1 });
  }

  return {
    checked: checked.length,
    withErrors: checked.filter((attempt) => attempt.addressMismatches.length > 0).length,
    examples: [...examples.values()].sort((first, second) => second.count - first.count).slice(0, TOP_EXAMPLES),
  };
}

export interface StudentSpelling {
  studentId: string;
  name: string;
  attempts: number;
  errors: number;
}

export interface SpellingSummary {
  students: StudentSpelling[];
  words: { word: string; count: number; suggestions: string[] }[];
}

export function spellingSummary(facts: AttemptFacts[], misspelled: ReadonlyMap<string, string[]>): SpellingSummary {
  const students = new Map<string, StudentSpelling>();
  const words = new Map<string, number>();

  for (const attempt of facts.filter((candidate) => candidate.typedWords.length > 0)) {
    const errors = misspelledIn(attempt.typedWords, misspelled);
    const current = students.get(attempt.studentId) ?? {
      studentId: attempt.studentId,
      name: attempt.studentName,
      attempts: 0,
      errors: 0,
    };

    students.set(attempt.studentId, { ...current, attempts: current.attempts + 1, errors: current.errors + errors.length });
    for (const word of errors) words.set(word, (words.get(word) ?? 0) + 1);
  }

  return {
    students: [...students.values()].sort((first, second) => second.errors - first.errors || first.name.localeCompare(second.name, "ru")),
    words: [...words]
      .sort(([, first], [, second]) => second - first)
      .slice(0, TOP_WORDS)
      .map(([word, count]) => ({ word, count, suggestions: misspelled.get(word) ?? [] })),
  };
}

export interface MissedService {
  incidentType: string;
  serviceCode: string;
  missed: number;
  total: number;
}

/** Пропуски служб по типам происшествий: сколько раз служба была в эталоне и сколько раз её не оповестили. */
export function missedServices(facts: AttemptFacts[]): MissedService[] {
  const rows = new Map<string, MissedService>();

  for (const check of facts.flatMap((attempt) => attempt.serviceChecks)) {
    const key = `${check.incidentType}\n${check.serviceCode}`;
    const current = rows.get(key) ?? { incidentType: check.incidentType, serviceCode: check.serviceCode, missed: 0, total: 0 };

    rows.set(key, { ...current, missed: current.missed + (check.missed ? 1 : 0), total: current.total + 1 });
  }

  return [...rows.values()]
    .filter((row) => row.missed > 0)
    .sort((first, second) => second.missed / second.total - first.missed / first.total || second.missed - first.missed);
}

export const dispatchStages: DispatchStage[] = ["accepted", "responseStarted", "arrived", "completed"];

export const dispatchStageLabels: Record<DispatchStage, string> = {
  accepted: "Принята",
  responseStarted: "Начало реагирования",
  arrived: "Прибытие",
  completed: "Работы завершены",
};

export interface StageSummary {
  stage: DispatchStage;
  averageMs: number | null;
  count: number;
}

export function stageSummary(facts: AttemptFacts[]): StageSummary[] {
  const times = facts.flatMap((attempt) => attempt.stageTimes);

  return dispatchStages.map((stage) => {
    const values = times.filter((time) => time.stage === stage).map((time) => time.ms);

    return { stage, averageMs: mean(values), count: values.length };
  });
}

export interface ColumnSide {
  column: AnalyticsColumn;
  share: ColumnShare;
}

/**
 * Сильные и слабые стороны группы по группам проверок. Слабые — наибольшая доля попыток с ошибкой;
 * сильные — наименьшая доля среди остальных. Проверка без применимых попыток не оценивается.
 */
export function groupSides(facts: AttemptFacts[]): { strong: ColumnSide[]; weak: ColumnSide[]; all: ColumnSide[] } {
  const shares = columnShares(facts);
  const all = analyticsColumns.flatMap((column) => {
    const share = shares.get(column);

    return share && share.applicable > 0 ? [{ column, share }] : [];
  });
  const weak = all
    .filter((side) => side.share.withErrors > 0)
    .sort((first, second) => rate(second.share) - rate(first.share) || second.share.withErrors - first.share.withErrors)
    .slice(0, SIDES_COUNT);
  const strong = all
    .filter((side) => !weak.includes(side))
    .sort((first, second) => rate(first.share) - rate(second.share) || second.share.applicable - first.share.applicable)
    .slice(0, SIDES_COUNT);

  return { strong, weak, all };
}

/** Сильная и слабая сторона обучаемого; одинаковая доля ошибок — не сторона, а ровный результат. */
export function studentSides(stats: StudentStats): { strong: AnalyticsColumn | null; weak: AnalyticsColumn | null } {
  const sides = [...stats.columns].filter(([, share]) => share.applicable > 0);
  const weak = stats.mainError?.column ?? null;
  const strong = sides
    .filter(([column]) => column !== weak)
    .sort(([, first], [, second]) => rate(first) - rate(second) || second.applicable - first.applicable)[0];
  const weakShare = weak === null ? null : stats.columns.get(weak);

  return {
    strong: strong === undefined || (weakShare && rate(strong[1]) >= rate(weakShare)) ? null : strong[0],
    weak,
  };
}

export function normsConclusion(facts: AttemptFacts[]): string {
  const totals = facts.reduce(
    (sum, attempt) =>
      attempt.norms === null
        ? sum
        : {
            opens: sum.opens + attempt.norms.opens,
            opensOnTime: sum.opensOnTime + attempt.norms.opensOnTime,
            entries: sum.entries + attempt.norms.entries,
            entriesOnTime: sum.entriesOnTime + attempt.norms.entriesOnTime,
          },
    { opens: 0, opensOnTime: 0, entries: 0, entriesOnTime: 0 },
  );

  if (totals.opens === 0) return "Нет карточек ДДС с действиями обучаемых.";

  return `Раскрыто в срок — ${percent.format(totals.opensOnTime / totals.opens)} карточек, первая запись в срок — ${percent.format(totals.entriesOnTime / totals.entries)}.`;
}

export function performanceConclusion(stats: StudentStats[]): string {
  const judged = stats.filter((student) => student.readiness !== null);
  const count = (level: "ready" | "practice") => judged.filter((student) => student.readiness?.level === level).length;

  if (judged.length === 0) return "Для оценки готовности нужны завершённые попытки.";

  return `Готовы к самостоятельной работе: ${count("ready")} из ${judged.length}; нужна практика — ${count("practice")}.`;
}

export function errorsConclusion(facts: AttemptFacts[]): string {
  const [top] = groupSides(facts).weak;

  if (top === undefined) return "Ошибок по группам проверок нет.";

  return `Чаще всего группа ошибается по проверке «${analyticsColumnLabels[top.column]}»: ${percent.format(rate(top.share))} попыток (${top.share.withErrors} из ${top.share.applicable}).`;
}

export function sidesConclusion(facts: AttemptFacts[]): string {
  const { strong, weak } = groupSides(facts);
  const names = (sides: ColumnSide[]) => sides.map((side) => `«${analyticsColumnLabels[side.column]}»`).join(", ");

  if (strong.length === 0 && weak.length === 0) return "Для выводов нужны разобранные попытки.";
  if (weak.length === 0) return `Группа уверена во всех проверках: ошибок нет.`;

  return strong.length === 0
    ? `Группа проседает: ${names(weak)}.`
    : `Группа уверена: ${names(strong)}; проседает: ${names(weak)}.`;
}

export function addressConclusion(summary: AddressSummary): string {
  if (summary.checked === 0) return "Адрес вводит оператор 112 — таких разобранных попыток в периоде нет.";
  if (summary.withErrors === 0) return `Адрес со слов заявителя верен во всех ${summary.checked} попытках оператора 112.`;

  return `Адрес со слов заявителя неверен в ${percent.format(summary.withErrors / summary.checked)} попыток оператора 112 (${summary.withErrors} из ${summary.checked}).`;
}

export function spellingConclusion(summary: SpellingSummary): string {
  const attempts = summary.students.reduce((sum, student) => sum + student.attempts, 0);
  const errors = summary.students.reduce((sum, student) => sum + student.errors, 0);
  const [word] = summary.words;

  if (attempts === 0) return "В периоде нет попыток, где обучаемые вводили текст сами.";
  if (errors === 0) return `Орфографических ошибок нет в ${attempts} попытках с введённым текстом.`;

  return `В среднем ${decimal.format(errors / attempts)} орфографической ошибки на попытку${word ? `; чаще всего — «${word.word}»` : ""}.`;
}

export function servicesConclusion(rows: MissedService[], serviceName: (code: string) => string): string {
  const [top] = rows;

  if (top === undefined) return "Все службы из эталона оповещены.";

  return `Чаще всего забывают «${serviceName(top.serviceCode)}» при «${top.incidentType}»: ${top.missed} из ${top.total}.`;
}

export function stagesConclusion(summary: StageSummary[]): string {
  const reached = summary.filter((stage) => stage.averageMs !== null);

  if (reached.length === 0) return "Нет карточек ДДС, раскрытых обучаемыми.";

  const steps = reached.map((stage, index) => ({
    from: index === 0 ? "Получена" : dispatchStageLabels[reached[index - 1]?.stage ?? stage.stage],
    to: dispatchStageLabels[stage.stage],
    ms: (stage.averageMs ?? 0) - (index === 0 ? 0 : (reached[index - 1]?.averageMs ?? 0)),
  }));
  const longest = steps.reduce((best, step) => (step.ms > best.ms ? step : best));

  return `Дольше всего — от «${longest.from}» до «${longest.to}»: в среднем ${formatDuration(longest.ms)}.`;
}
