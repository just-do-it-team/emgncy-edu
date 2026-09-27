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
  participantRoleLabels,
} from "@/entities/monitoring";
import type { EmergencyService, MonitoredSession } from "@/shared/api";
import { ACK_TIMEOUT_SECONDS, CARD_FILL_NORM_SECONDS, criterionLabels } from "@/shared/config";
import { formatDateTime, localDayKey } from "@/shared/lib";
import type { Lesson } from "./build-lessons";
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
  generatedAt: Date;
}

type TextStyle = Omit<PdfTextNode, "text">;

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
    ["Нормативы", `обработка карточки ${CARD_FILL_NORM_SECONDS} с, подтверждение ${ACK_TIMEOUT_SECONDS} с`],
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

function attemptsContent({ lesson }: LessonReport, palette: ReportPalette): PdfContent[] {
  if (lesson.attempts.length === 0) return [];

  const assignments = new Map(lesson.assignments.map((assignment) => [assignment.id, assignment]));
  const ordered = [...lesson.attempts].sort(
    (first, second) => Date.parse(first.completedAt ?? "") - Date.parse(second.completedAt ?? ""),
  );

  return section("Попытки", [
    grid(
      palette,
      ["*", 90, 90, 40, 70, 60],
      ["Обучаемый", "Роль", "Завершена", "Балл", "Результат", "В срок"],
      ordered.map((session) => {
        const deadline = attemptDeadline(session, assignments.get(session.assignmentId));

        return [
          text(studentsOf(session)),
          text(rolesOf(session)),
          text(session.completedAt ? formatDateTime(session.completedAt) : "—"),
          session.score === null ? text("—", { alignment: "right" }) : number(session.score),
          text(
            attemptResultLabel(session),
            attemptResultKind(session) === "failed" ? { color: palette.deviation } : {},
          ),
          deadline === "late"
            ? text("с опозданием", { color: palette.deviation })
            : text(deadline === "on_time" ? "в срок" : "—"),
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

export function lessonReportFileName(lesson: Lesson, now: Date): string {
  const name = lesson.scenarioName.replace(FORBIDDEN_FILE_CHARACTERS, "_");

  return `${name}_${localDayKey(now)}.pdf`;
}

function absoluteUrl(path: string): string {
  return new URL(path, window.location.href).href;
}

function isSameOrigin(url: string): boolean {
  return new URL(url).origin === window.location.origin;
}

export async function downloadLessonReport(report: LessonReport, palette: ReportPalette): Promise<void> {
  const { default: pdfMake } = await import("pdfmake/build/pdfmake");

  pdfMake.setUrlAccessPolicy(isSameOrigin);
  pdfMake.setFonts({
    [LATIN_FONT]: { normal: absoluteUrl(latinRegular), bold: absoluteUrl(latinBold) },
    [CYRILLIC_FONT]: { normal: absoluteUrl(cyrillicRegular), bold: absoluteUrl(cyrillicBold) },
  });

  await pdfMake
    .createPdf(lessonReportDocument(report, palette))
    .download(lessonReportFileName(report.lesson, report.generatedAt));
}
