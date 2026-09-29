import cyrillicBold from "@fontsource/roboto/files/roboto-cyrillic-500-normal.woff?url";
import cyrillicRegular from "@fontsource/roboto/files/roboto-cyrillic-400-normal.woff?url";
import latinBold from "@fontsource/roboto/files/roboto-latin-500-normal.woff?url";
import latinRegular from "@fontsource/roboto/files/roboto-latin-400-normal.woff?url";
import type {
  PdfContent,
  PdfDocumentDefinition,
  PdfMargin,
  PdfTableLayout,
  PdfTextNode,
  PdfTextRun,
} from "pdfmake/build/pdfmake";
import { discrepancyLabel, discrepancyValue } from "@/entities/expert-review";
import {
  attemptDeadline,
  attemptResultKind,
  attemptResultLabel,
  formatDeviation,
  formatFillTime,
  participantRoleLabels,
  type AttemptMetrics,
} from "@/entities/monitoring";
import type { EmergencyService, MonitoredSession } from "@/shared/api";
import { criterionLabels, REACTION_NORMS_TEXT } from "@/shared/config";
import { formatDateTime, localDayKey, SPELLING_CAPTION } from "@/shared/lib";
import type { Lesson } from "./build-lessons";
import type { LessonAiReview } from "./lesson-ai-review";
import type { AttemptLink, LessonFindingsSummary } from "./lesson-summary";
import { completedAttemptsPhrase } from "./plurals";

const LATIN_FONT = "RobotoLatin";
const CYRILLIC_FONT = "RobotoCyrillic";
const CYRILLIC_RUN = /([Ѐ-ӿ№]+)/u;
const FORBIDDEN_FILE_CHARACTERS = /[\\/:*?"<>|;\s]+/g;

const BASE_FONT_SIZE = 9;
const SMALL_FONT_SIZE = 8;
const TITLE_FONT_SIZE = 15;
const SECTION_FONT_SIZE = 11;
const PAGE_MARGINS: PdfMargin = [40, 40, 40, 50];
const FOOTER_MARGIN: PdfMargin = [40, 16, 40, 0];
const SECTION_MARGIN: PdfMargin = [0, 14, 0, 6];
const NOTE_MARGIN: PdfMargin = [0, 0, 0, 6];
const LINE_WIDTH = 0.5;
const CELL_PADDING_X = 4;
const CELL_PADDING_Y = 2;

const scoreFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export interface ReportPalette {
  text: string;
  muted: string;
  line: string;
  deviation: string;
}

export interface LessonReport {
  lesson: Lesson;
  findings: LessonFindingsSummary;
  findingsTotal: number;
  services: Map<string, EmergencyService> | undefined;
  aiReview: LessonAiReview | null;
  metrics: Map<string, AttemptMetrics>;
  generatedAt: Date;
}

type TextStyle = Omit<PdfTextNode, "text">;

/**
 * Делит строку на фрагменты латиницы и кириллицы для pdfmake. Файлы Roboto из пакета шрифтов
 * разбиты по алфавитам, а pdfmake не умеет подбирать запасной шрифт по символу, поэтому каждому
 * фрагменту шрифт назначается явно — иначе кириллица в PDF превратится в пустые квадраты.
 */
function runs(value: string): PdfTextRun[] {
  return value
    .split(CYRILLIC_RUN)
    .flatMap((piece, index) =>
      piece === "" ? [] : [{ text: piece, font: index % 2 === 1 ? CYRILLIC_FONT : LATIN_FONT }],
    );
}

function text(value: string, style: TextStyle = {}): PdfTextNode {
  return { text: runs(value), ...style };
}

function number(value: number, style: TextStyle = {}): PdfTextNode {
  return text(scoreFormatter.format(value), { alignment: "right", ...style });
}

function gridLayout(palette: ReportPalette, lineWidth: number): PdfTableLayout {
  return {
    hLineWidth: () => lineWidth,
    vLineWidth: () => lineWidth,
    hLineColor: () => palette.line,
    vLineColor: () => palette.line,
    paddingLeft: () => CELL_PADDING_X,
    paddingRight: () => CELL_PADDING_X,
    paddingTop: () => CELL_PADDING_Y,
    paddingBottom: () => CELL_PADDING_Y,
  };
}

function grid(
  palette: ReportPalette,
  widths: (number | "*")[],
  header: string[],
  rows: PdfTextNode[][],
): PdfContent {
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths,
      body: [header.map((label) => text(label, { bold: true })), ...rows],
    },
    layout: gridLayout(palette, LINE_WIDTH),
  };
}

function facts(palette: ReportPalette, rows: [string, string][]): PdfContent[] {
  if (rows.length === 0) return [];

  return [
    {
      table: {
        headerRows: 0,
        dontBreakRows: true,
        widths: [170, "*"],
        body: rows.map(([label, value]) => [text(label, { color: palette.muted }), text(value)]),
      },
      layout: gridLayout(palette, 0),
    },
  ];
}

function section(title: string, body: PdfContent[]): PdfContent[] {
  return body.length === 0 ? [] : [text(title, { bold: true, fontSize: SECTION_FONT_SIZE, margin: SECTION_MARGIN }), ...body];
}

function studentsOf(session: MonitoredSession): string {
  return session.participants.map((participant) => participant.displayName).join(", ") || "—";
}

function rolesOf(session: MonitoredSession): string {
  return [...new Set(session.participants.map((participant) => participantRoleLabels[participant.role]))].join(", ") || "—";
}

function windowOf(lesson: Lesson): string | null {
  const parts = [
    lesson.availableFrom === null ? null : `с ${formatDateTime(lesson.availableFrom)}`,
    lesson.dueAt === null ? null : `до ${formatDateTime(lesson.dueAt)}`,
  ].filter((part) => part !== null);

  return parts.length === 0 ? null : parts.join(" ");
}

function headerContent(report: LessonReport, palette: ReportPalette): PdfContent[] {
  const { lesson } = report;
  const window = windowOf(lesson);
  const rows: [string, string][] = [
    ["Группа", lesson.groupName ?? "Без группы"],
    ["Участников", String(lesson.participantIds.length)],
    ["Назначено", formatDateTime(lesson.assignedAt)],
    ...(window === null ? [] : [["Выполнить", window] as [string, string]]),
    ["Нормативы реакции", REACTION_NORMS_TEXT],
    ...(lesson.passingScore === null
      ? []
      : [["Порог зачёта", `средний балл не ниже ${scoreFormatter.format(lesson.passingScore)} из 100`] as [string, string]]),
    ["Отчёт сформирован", formatDateTime(report.generatedAt)],
  ];

  return [text(lesson.scenarioName, { bold: true, fontSize: TITLE_FONT_SIZE, margin: NOTE_MARGIN }), ...facts(palette, rows)];
}

function summaryContent({ lesson }: LessonReport, palette: ReportPalette): PdfContent[] {
  const rows: [string, string][] = [];

  if (lesson.average) {
    rows.push([
      "Средний балл по завершённым попыткам",
      `${scoreFormatter.format(lesson.average.value)} (${completedAttemptsPhrase(lesson.average.count)})`,
    ]);
  }
  if (lesson.judgedCount > 0) rows.push(["Зачтено", `${lesson.passedCount} из ${lesson.judgedCount}`]);
  if (lesson.abortedCount > 0) {
    rows.push(["Прерванных попыток", `${lesson.abortedCount}, в средний балл не входят`]);
  }

  return section("Итог", facts(palette, rows));
}

function criteriaContent({ findings, findingsTotal }: LessonReport, palette: ReportPalette): PdfContent[] {
  if (findings.criteria.length === 0) return [];

  const note =
    findings.analyzed < findingsTotal
      ? [
          text(
            `Учтено ${findings.analyzed} из ${findingsTotal} завершённых попыток: разборы остальных не загрузились.`,
            { color: palette.muted, margin: NOTE_MARGIN },
          ),
        ]
      : [];

  return section("Критерии", [
    ...note,
    grid(
      palette,
      ["*", 110, 70],
      ["Критерий", "Попыток с расхождениями", "Из попыток"],
      findings.criteria.map((criterion) => [
        text(`${criterion.code} ${criterionLabels[criterion.code]}`),
        number(criterion.attemptsWithFindings, criterion.attemptsWithFindings > 0 ? { color: palette.deviation } : {}),
        number(criterion.applicableAttempts),
      ]),
    ),
  ]);
}

function repeatedContent({ findings, services }: LessonReport, palette: ReportPalette): PdfContent[] {
  if (findings.repeated.length === 0) return [];

  return section("Повторяющиеся ошибки", [
    grid(
      palette,
      ["*", 110, 110, 60],
      ["Расхождение", "Ожидалось", "Получено", "Обучаемых"],
      findings.repeated.map((repeated) => [
        text(discrepancyLabel(repeated.path, services)),
        text(discrepancyValue(repeated.path, repeated.expected)),
        text(discrepancyValue(repeated.path, repeated.actual), { color: palette.deviation }),
        number(repeated.studentsCount),
      ]),
    ),
  ]);
}

function deadlinesContent({ findings }: LessonReport, palette: ReportPalette): PdfContent[] {
  const row = (label: string) => (link: AttemptLink) => [
    text(label, { color: palette.deviation }),
    text(link.students),
    text(link.elementLabel ?? "—"),
  ];
  const rows = [
    ...findings.openMissed.map(row("Карточка раскрыта позже срока")),
    ...findings.decisionMissed.map(row("Решение по карточке позже срока")),
  ];

  if (rows.length === 0) return [];

  return section("Нарушения сроков", [grid(palette, [180, "*", 90], ["Нарушение", "Обучаемый", "Элемент"], rows)]);
}

function aiReviewContent({ aiReview }: LessonReport, palette: ReportPalette): PdfContent[] {
  if (aiReview === null || aiReview.source !== "ai") return [];

  const origin = [aiReview.model, aiReview.generatedAt === null ? null : formatDateTime(aiReview.generatedAt)]
    .filter(Boolean)
    .join(", ");

  return section("Разбор ИИ", [
    text(`Сформировано ИИ, требует проверки преподавателем${origin ? ` (${origin})` : ""}.`, {
      color: palette.muted,
      margin: NOTE_MARGIN,
    }),
    text(aiReview.summary, { margin: NOTE_MARGIN }),
    ...(aiReview.typicalErrors.length === 0
      ? []
      : [
          grid(
            palette,
            [150, "*", 60],
            ["Типичная ошибка", "Описание", "Обучаемых"],
            aiReview.typicalErrors.map((error) => [text(error.title), text(error.description), number(error.studentsCount)]),
          ),
        ]),
    text("Рекомендации преподавателю", { bold: true, margin: SECTION_MARGIN }),
    ...aiReview.recommendations.map((recommendation) => text(`— ${recommendation}`)),
    ...(aiReview.studentNotes.length === 0
      ? []
      : [
          text("По обучаемым", { bold: true, margin: SECTION_MARGIN }),
          grid(
            palette,
            [150, "*"],
            ["Обучаемый", "Заметка"],
            aiReview.studentNotes.map((note) => [text(note.students), text(note.note)]),
          ),
        ]),
  ]);
}

function attemptOutcomeCells(session: MonitoredSession, palette: ReportPalette): PdfTextNode[] {
  if (session.teacherAssessed && session.score !== null) {
    return [
      text(`${scoreFormatter.format(session.score)} преп.`, { alignment: "right" }),
      text(attemptResultLabel(session), attemptResultKind(session) === "failed" ? { color: palette.deviation } : {}),
    ];
  }

  return [
    session.score === null ? text("—", { alignment: "right" }) : number(session.score),
    text(attemptResultLabel(session), attemptResultKind(session) === "failed" ? { color: palette.deviation } : {}),
  ];
}

function attemptsContent({ lesson, metrics }: LessonReport, palette: ReportPalette): PdfContent[] {
  if (lesson.attempts.length === 0) return [];

  const assignments = new Map(lesson.assignments.map((assignment) => [assignment.id, assignment]));
  const ordered = [...lesson.attempts].sort(
    (first, second) => Date.parse(first.completedAt ?? "") - Date.parse(second.completedAt ?? ""),
  );

  const teacherScored = ordered.some((session) => session.teacherAssessed);

  return section("Попытки", [
    ...(teacherScored
      ? [text("«преп.» — оценка преподавателя, она заменяет автоматическую.", { color: palette.muted, margin: NOTE_MARGIN })]
      : []),
    text(`Заполнение — карточка ДДС от выпуска до первой записи, звонок 112 от ответа до создания карточки; «±» — к нормативу 3 мин. ${SPELLING_CAPTION}`, {
      color: palette.muted,
      margin: NOTE_MARGIN,
    }),
    grid(
      palette,
      ["*", 72, 72, 34, 58, 50, 44, 40, 40],
      ["Обучаемый", "Роль", "Завершена", "Балл", "Результат", "В срок", "Заполн.", "±", "Орфогр."],
      ordered.map((session) => {
        const deadline = attemptDeadline(session, assignments.get(session.assignmentId));
        const metric = metrics.get(session.sessionId);
        const deviation = metric?.deviationMs ?? null;

        return [
          text(studentsOf(session)),
          text(rolesOf(session)),
          text(session.completedAt ? formatDateTime(session.completedAt) : "—"),
          ...attemptOutcomeCells(session, palette),
          deadline === "late"
            ? text("с опозданием", { color: palette.deviation })
            : text(deadline === "on_time" ? "в срок" : "—"),
          text(formatFillTime(metric?.fillMs ?? null)),
          text(formatDeviation(deviation), deviation !== null && deviation > 0 ? { color: palette.deviation } : {}),
          text(metric?.misspellings === null || metric === undefined ? "—" : String(metric.misspellings)),
        ];
      }),
    ),
  ]);
}

export function lessonReportDocument(report: LessonReport, palette: ReportPalette): PdfDocumentDefinition {
  const generated = `Сформировано ${formatDateTime(report.generatedAt)}`;

  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: PAGE_MARGINS,
    info: { title: report.lesson.scenarioName },
    defaultStyle: { font: LATIN_FONT, fontSize: BASE_FONT_SIZE, color: palette.text, lineHeight: 1.2 },
    content: [
      ...headerContent(report, palette),
      ...summaryContent(report, palette),
      ...criteriaContent(report, palette),
      ...repeatedContent(report, palette),
      ...deadlinesContent(report, palette),
      ...aiReviewContent(report, palette),
      ...attemptsContent(report, palette),
    ],
    footer: (currentPage, pageCount) => ({
      columns: [
        text(generated, { fontSize: SMALL_FONT_SIZE, color: palette.muted }),
        text(`Страница ${currentPage} из ${pageCount}`, {
          fontSize: SMALL_FONT_SIZE,
          color: palette.muted,
          alignment: "right",
        }),
      ],
      margin: FOOTER_MARGIN,
    }),
  };
}

export function lessonReportFileName(lesson: Lesson, now: Date, extension: "pdf" | "csv"): string {
  const name = lesson.scenarioName.replace(FORBIDDEN_FILE_CHARACTERS, "_");

  return `${name}_${localDayKey(now)}.${extension}`;
}

function absoluteUrl(path: string): string {
  return new URL(path, window.location.href).href;
}

function isSameOrigin(url: string): boolean {
  return new URL(url).origin === window.location.origin;
}

/**
 * Собирает PDF в браузере. pdfmake подгружается только по кнопке, чтобы не утяжелять страницу.
 * Шрифты берутся из собственного бандла, а загрузка ресурсов по URL ограничена своим адресом —
 * в изолированном контуре отчёт не делает внешних запросов.
 */
export async function downloadLessonReport(report: LessonReport, palette: ReportPalette): Promise<void> {
  const { default: pdfMake } = await import("pdfmake/build/pdfmake");

  pdfMake.setUrlAccessPolicy(isSameOrigin);
  pdfMake.setFonts({
    [LATIN_FONT]: { normal: absoluteUrl(latinRegular), bold: absoluteUrl(latinBold) },
    [CYRILLIC_FONT]: { normal: absoluteUrl(cyrillicRegular), bold: absoluteUrl(cyrillicBold) },
  });

  await pdfMake
    .createPdf(lessonReportDocument(report, palette))
    .download(lessonReportFileName(report.lesson, report.generatedAt, "pdf"));
}
