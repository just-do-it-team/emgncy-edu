import type { PdfContent, PdfTextNode } from "pdfmake/build/pdfmake";
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
import {
  downloadPdf,
  formatDateTime,
  PDF_NOTE_MARGIN,
  pdfFacts,
  pdfGrid,
  pdfNumber,
  pdfSection,
  pdfSubheading,
  pdfText,
  pdfTitle,
  reportDocument,
  reportFileName,
  SPELLING_CAPTION,
  type ReportPalette,
} from "@/shared/lib";
import type { Lesson } from "./build-lessons";
import type { LessonAiReview } from "./lesson-ai-review";
import type { AttemptLink, LessonFindingsSummary } from "./lesson-summary";
import { completedAttemptsPhrase } from "./plurals";

const scoreFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export interface LessonReport {
  lesson: Lesson;
  findings: LessonFindingsSummary;
  findingsTotal: number;
  services: Map<string, EmergencyService> | undefined;
  aiReview: LessonAiReview | null;
  metrics: Map<string, AttemptMetrics>;
  generatedAt: Date;
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

  return [pdfTitle(lesson.scenarioName), ...pdfFacts(palette, rows)];
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

  return pdfSection("Итог", pdfFacts(palette, rows));
}

function criteriaContent({ findings, findingsTotal }: LessonReport, palette: ReportPalette): PdfContent[] {
  if (findings.criteria.length === 0) return [];

  const note =
    findings.analyzed < findingsTotal
      ? [
          pdfText(
            `Учтено ${findings.analyzed} из ${findingsTotal} завершённых попыток: разборы остальных не загрузились.`,
            { color: palette.muted, margin: PDF_NOTE_MARGIN },
          ),
        ]
      : [];

  return pdfSection("Критерии", [
    ...note,
    pdfGrid(
      palette,
      ["*", 110, 70],
      ["Критерий", "Попыток с расхождениями", "Из попыток"],
      findings.criteria.map((criterion) => [
        pdfText(`${criterion.code} ${criterionLabels[criterion.code]}`),
        pdfNumber(criterion.attemptsWithFindings, criterion.attemptsWithFindings > 0 ? { color: palette.deviation } : {}),
        pdfNumber(criterion.applicableAttempts),
      ]),
    ),
  ]);
}

function repeatedContent({ findings, services }: LessonReport, palette: ReportPalette): PdfContent[] {
  if (findings.repeated.length === 0) return [];

  return pdfSection("Повторяющиеся ошибки", [
    pdfGrid(
      palette,
      ["*", 110, 110, 60],
      ["Расхождение", "Ожидалось", "Указано", "Обучаемых"],
      findings.repeated.map((repeated) => [
        pdfText(discrepancyLabel(repeated.path, services)),
        pdfText(discrepancyValue(repeated.path, repeated.expected)),
        pdfText(discrepancyValue(repeated.path, repeated.actual), { color: palette.deviation }),
        pdfNumber(repeated.studentsCount),
      ]),
    ),
  ]);
}

function deadlinesContent({ findings }: LessonReport, palette: ReportPalette): PdfContent[] {
  const row = (label: string) => (link: AttemptLink) => [
    pdfText(label, { color: palette.deviation }),
    pdfText(link.students),
    pdfText(link.elementLabel ?? "—"),
  ];
  const rows = [
    ...findings.openMissed.map(row("Карточка раскрыта позже срока")),
    ...findings.decisionMissed.map(row("Решение по карточке позже срока")),
  ];

  if (rows.length === 0) return [];

  return pdfSection("Нарушения сроков", [pdfGrid(palette, [180, "*", 90], ["Нарушение", "Обучаемый", "Элемент"], rows)]);
}

function aiReviewContent({ aiReview }: LessonReport, palette: ReportPalette): PdfContent[] {
  if (aiReview === null || aiReview.source !== "ai") return [];

  const origin = [aiReview.model, aiReview.generatedAt === null ? null : formatDateTime(aiReview.generatedAt)]
    .filter(Boolean)
    .join(", ");

  return pdfSection("Разбор ИИ", [
    pdfText(`Сформировано ИИ, требует проверки преподавателем${origin ? ` (${origin})` : ""}.`, {
      color: palette.muted,
      margin: PDF_NOTE_MARGIN,
    }),
    pdfText(aiReview.summary, { margin: PDF_NOTE_MARGIN }),
    ...(aiReview.typicalErrors.length === 0
      ? []
      : [
          pdfGrid(
            palette,
            [150, "*", 60],
            ["Типичная ошибка", "Описание", "Обучаемых"],
            aiReview.typicalErrors.map((error) => [pdfText(error.title), pdfText(error.description), pdfNumber(error.studentsCount)]),
          ),
        ]),
    pdfSubheading("Рекомендации преподавателю"),
    ...aiReview.recommendations.map((recommendation) => pdfText(`— ${recommendation}`)),
    ...(aiReview.studentNotes.length === 0
      ? []
      : [
          pdfSubheading("По обучаемым"),
          pdfGrid(
            palette,
            [150, "*"],
            ["Обучаемый", "Заметка"],
            aiReview.studentNotes.map((note) => [pdfText(note.students), pdfText(note.note)]),
          ),
        ]),
  ]);
}

function attemptOutcomeCells(session: MonitoredSession, palette: ReportPalette): PdfTextNode[] {
  if (session.teacherAssessed && session.score !== null) {
    return [
      pdfText(`${scoreFormatter.format(session.score)} преп.`, { alignment: "right" }),
      pdfText(attemptResultLabel(session), attemptResultKind(session) === "failed" ? { color: palette.deviation } : {}),
    ];
  }

  return [
    session.score === null ? pdfText("—", { alignment: "right" }) : pdfNumber(session.score),
    pdfText(attemptResultLabel(session), attemptResultKind(session) === "failed" ? { color: palette.deviation } : {}),
  ];
}

function attemptsContent({ lesson, metrics }: LessonReport, palette: ReportPalette): PdfContent[] {
  if (lesson.attempts.length === 0) return [];

  const assignments = new Map(lesson.assignments.map((assignment) => [assignment.id, assignment]));
  const ordered = [...lesson.attempts].sort(
    (first, second) => Date.parse(first.completedAt ?? "") - Date.parse(second.completedAt ?? ""),
  );

  const teacherScored = ordered.some((session) => session.teacherAssessed);

  return pdfSection("Попытки", [
    ...(teacherScored
      ? [pdfText("«преп.» — оценка преподавателя, она заменяет автоматическую.", { color: palette.muted, margin: PDF_NOTE_MARGIN })]
      : []),
    pdfText(`Заполнение — карточка ДДС от выпуска до первой записи, звонок 112 от ответа до создания карточки; «±» — к нормативу 3 мин. ${SPELLING_CAPTION}`, {
      color: palette.muted,
      margin: PDF_NOTE_MARGIN,
    }),
    pdfGrid(
      palette,
      ["*", 72, 72, 34, 58, 50, 44, 40, 40],
      ["Обучаемый", "Роль", "Завершена", "Балл", "Результат", "В срок", "Заполн.", "±", "Орфогр."],
      ordered.map((session) => {
        const deadline = attemptDeadline(session, assignments.get(session.assignmentId));
        const metric = metrics.get(session.sessionId);
        const deviation = metric?.deviationMs ?? null;

        return [
          pdfText(studentsOf(session)),
          pdfText(rolesOf(session)),
          pdfText(session.completedAt ? formatDateTime(session.completedAt) : "—"),
          ...attemptOutcomeCells(session, palette),
          deadline === "late"
            ? pdfText("с опозданием", { color: palette.deviation })
            : pdfText(deadline === "on_time" ? "в срок" : "—"),
          pdfText(formatFillTime(metric?.fillMs ?? null)),
          pdfText(formatDeviation(deviation), deviation !== null && deviation > 0 ? { color: palette.deviation } : {}),
          pdfText(metric?.misspellings === null || metric === undefined ? "—" : String(metric.misspellings)),
        ];
      }),
    ),
  ]);
}

export function lessonReportDocument(report: LessonReport, palette: ReportPalette) {
  return reportDocument(
    report.lesson.scenarioName,
    [
      ...headerContent(report, palette),
      ...summaryContent(report, palette),
      ...criteriaContent(report, palette),
      ...repeatedContent(report, palette),
      ...deadlinesContent(report, palette),
      ...aiReviewContent(report, palette),
      ...attemptsContent(report, palette),
    ],
    palette,
    report.generatedAt,
  );
}

export function lessonReportFileName(lesson: Lesson, now: Date, extension: "pdf" | "csv"): string {
  return reportFileName(lesson.scenarioName, now, extension);
}

export function downloadLessonReport(report: LessonReport, palette: ReportPalette): Promise<void> {
  return downloadPdf(lessonReportDocument(report, palette), lessonReportFileName(report.lesson, report.generatedAt, "pdf"));
}
