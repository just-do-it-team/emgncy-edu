import type { PdfContent } from "pdfmake/build/pdfmake";
import {
  pdfFacts,
  pdfGrid,
  pdfNote,
  pdfNumber,
  pdfSection,
  pdfShareBar,
  pdfText,
  pdfTitle,
  reportDocument,
  type ReportPalette,
} from "@/shared/lib";
import { studentForecast } from "./forecast";
import {
  addressConclusion,
  dispatchStageLabels,
  errorsConclusion,
  formatDuration,
  groupSides,
  performanceConclusion,
  servicesConclusion,
  spellingConclusion,
  stagesConclusion,
  studentSides,
  type AddressSummary,
  type MissedService,
  type PeriodKpis,
  type SpellingSummary,
  type StageSummary,
} from "./group-insights";
import { analyticsColumnLabels, readinessLabels, type AttemptFacts, type StudentStats } from "./student-stats";

const score = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("ru-RU", { style: "percent", maximumFractionDigits: 0 });
const MAX_ROWS = 10;

export interface AnalyticsReport {
  scope: string;
  kpis: PeriodKpis;
  facts: AttemptFacts[];
  stats: StudentStats[];
  address: AddressSummary;
  spelling: SpellingSummary | null;
  missed: MissedService[];
  stages: StageSummary[];
  serviceName: (code: string) => string;
  generatedAt: Date;
}

function formatted(value: number | null, format: (value: number) => string): string {
  return value === null ? "—" : format(value);
}

function performanceGrid(stats: StudentStats[], palette: ReportPalette): PdfContent {
  return pdfGrid(
    palette,
    ["*", 40, 40, 45, 55, 90, 90],
    ["Обучаемый", "Попыток", "Балл", "Зачтено", "Нормативы", "Слабая сторона", "Готовность"],
    stats.map((student) => {
      const weak = studentSides(student).weak;

      return [
        pdfText(student.name),
        pdfNumber(student.attempts.length),
        pdfText(formatted(student.average, (value) => score.format(value)), { alignment: "right" }),
        pdfText(formatted(student.passShare, (value) => percent.format(value)), { alignment: "right" }),
        pdfText(formatted(student.normShare, (value) => percent.format(value)), { alignment: "right" }),
        pdfText(weak === null ? "—" : analyticsColumnLabels[weak]),
        pdfText(student.readiness === null ? "—" : readinessLabels[student.readiness.level]),
      ];
    }),
  );
}

/** Отчёт только по таблице «Успеваемость обучаемых» — с теми же фильтрами и сортировкой, что на экране. */
export function performanceContent(scope: string, stats: StudentStats[], palette: ReportPalette): PdfContent[] {
  return [
    pdfTitle("Успеваемость обучаемых"),
    pdfNote(scope, palette),
    pdfNote(performanceConclusion(stats), palette),
    performanceGrid(stats, palette),
  ];
}

function kpiContent({ kpis }: AnalyticsReport, palette: ReportPalette): PdfContent[] {
  return pdfSection("Ключевые показатели", [
    ...pdfFacts(palette, [
      ["Попыток", String(kpis.attempts)],
      ["Средний итоговый балл", formatted(kpis.averageScore, (value) => score.format(value))],
      ["Зачтено", formatted(kpis.passShare, (value) => percent.format(value))],
      ["В нормативе 30 с / 3 мин", formatted(kpis.normShare, (value) => percent.format(value))],
      ["Орфографических ошибок на попытку", formatted(kpis.spellingPerAttempt, (value) => score.format(value))],
    ]),
  ]);
}

function errorsContent({ facts }: AnalyticsReport, palette: ReportPalette): PdfContent[] {
  const analyzed = facts.filter((attempt) => attempt.errors !== null);
  const { all } = groupSides(analyzed);

  if (all.length === 0) return [];

  return pdfSection("Ошибки по группам проверок", [
    pdfNote(errorsConclusion(analyzed), palette),
    pdfGrid(
      palette,
      ["*", 70, 100],
      ["Группа проверок", "С ошибкой", "Доля"],
      [...all]
        .sort((first, second) => second.share.withErrors / second.share.applicable - first.share.withErrors / first.share.applicable)
        .map(({ column, share }) => [
          pdfText(analyticsColumnLabels[column]),
          pdfText(`${share.withErrors} из ${share.applicable}`, { alignment: "right" }),
          pdfShareBar(share.withErrors / share.applicable, palette.deviation, palette),
        ]),
    ),
  ]);
}

function addressContent({ address }: AnalyticsReport, palette: ReportPalette): PdfContent[] {
  return pdfSection("Ошибки в адресах", [
    pdfNote(addressConclusion(address), palette),
    ...(address.examples.length === 0
      ? []
      : [
          pdfGrid(
            palette,
            ["*", "*", 35],
            ["Ожидалось", "Ввёл обучаемый", "Раз"],
            address.examples.map((example) => [
              pdfText(example.expected),
              pdfText(example.actual, { color: palette.deviation }),
              pdfNumber(example.count),
            ]),
          ),
        ]),
  ]);
}

function spellingContent({ spelling }: AnalyticsReport, palette: ReportPalette): PdfContent[] {
  if (spelling === null) return [];

  return pdfSection("Грамотность ввода", [
    pdfNote(spellingConclusion(spelling), palette),
    ...(spelling.words.length === 0
      ? []
      : [
          pdfGrid(
            palette,
            ["*", "*", 40],
            ["Слово с ошибкой", "Варианты", "Раз"],
            spelling.words.map((word) => [
              pdfText(word.word, { color: palette.deviation }),
              pdfText(word.suggestions.slice(0, 2).join(", ") || "—"),
              pdfNumber(word.count),
            ]),
          ),
        ]),
  ]);
}

function servicesContent({ missed, serviceName }: AnalyticsReport, palette: ReportPalette): PdfContent[] {
  if (missed.length === 0) return [];

  return pdfSection("Какие службы забывают оповестить", [
    pdfNote(servicesConclusion(missed, serviceName), palette),
    pdfGrid(
      palette,
      ["*", 140, 55, 100],
      ["Тип происшествия", "Служба", "Пропущена", "Доля"],
      missed.slice(0, MAX_ROWS).map((row) => [
        pdfText(row.incidentType),
        pdfText(serviceName(row.serviceCode)),
        pdfText(`${row.missed} из ${row.total}`, { alignment: "right" }),
        pdfShareBar(row.missed / row.total, palette.deviation, palette),
      ]),
    ),
  ]);
}

function stagesContent({ stages }: AnalyticsReport, palette: ReportPalette): PdfContent[] {
  if (stages.every((stage) => stage.averageMs === null)) return [];

  return pdfSection("Время по статусам ДДС", [
    pdfNote(stagesConclusion(stages), palette),
    pdfGrid(
      palette,
      ["*", 80, 60],
      ["От «Получена» до статуса", "Среднее время", "Карточек"],
      stages.map((stage) => [
        pdfText(`«${dispatchStageLabels[stage.stage]}»`),
        pdfText(stage.averageMs === null ? "не доходили" : formatDuration(stage.averageMs), { alignment: "right" }),
        pdfNumber(stage.count),
      ]),
    ),
  ]);
}

function forecastContent({ stats }: AnalyticsReport, palette: ReportPalette): PdfContent[] {
  const rows = stats.map((student) => ({ student, value: studentForecast(student.attempts) }));

  return pdfSection("Прогноз на следующее занятие", [
    pdfGrid(
      palette,
      ["*", 60, 70, "*"],
      ["Обучаемый", "Ожидаемый балл", "Интервал", "Зона риска"],
      rows.map(({ student, value }) => [
        pdfText(student.name),
        pdfText(value.forecast === null ? "—" : score.format(value.forecast.expected), { alignment: "right" }),
        pdfText(value.forecast === null ? "—" : `${score.format(value.forecast.low)}–${score.format(value.forecast.high)}`, {
          alignment: "right",
        }),
        pdfText(value.atRisk ? `да: ${value.riskReason ?? ""}` : "нет", value.atRisk ? { color: palette.deviation } : {}),
      ]),
    ),
  ]);
}

export function analyticsDocument(report: AnalyticsReport, palette: ReportPalette) {
  return reportDocument(
    "Аналитика по группе",
    [
      pdfTitle("Аналитика по группе"),
      pdfNote(report.scope, palette),
      ...kpiContent(report, palette),
      ...pdfSection("Успеваемость обучаемых", [pdfNote(performanceConclusion(report.stats), palette), performanceGrid(report.stats, palette)]),
      ...errorsContent(report, palette),
      ...addressContent(report, palette),
      ...spellingContent(report, palette),
      ...servicesContent(report, palette),
      ...stagesContent(report, palette),
      ...forecastContent(report, palette),
    ],
    palette,
    report.generatedAt,
  );
}
