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
import { formatDateTime, localDayKey } from "./date-time";

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
export const PDF_NOTE_MARGIN: PdfMargin = [0, 0, 0, 6];
const LINE_WIDTH = 0.5;
const CELL_PADDING_X = 4;
const CELL_PADDING_Y = 2;
const BAR_WIDTH = 90;
const BAR_HEIGHT = 8;

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export interface ReportPalette {
  text: string;
  muted: string;
  line: string;
  deviation: string;
}

export type PdfTextStyle = Omit<PdfTextNode, "text">;

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

export function pdfText(value: string, style: PdfTextStyle = {}): PdfTextNode {
  return { text: runs(value), ...style };
}

export function pdfNumber(value: number, style: PdfTextStyle = {}): PdfTextNode {
  return pdfText(numberFormatter.format(value), { alignment: "right", ...style });
}

export function pdfTitle(value: string): PdfTextNode {
  return pdfText(value, { bold: true, fontSize: TITLE_FONT_SIZE, margin: PDF_NOTE_MARGIN });
}

export function pdfNote(value: string, palette: ReportPalette): PdfTextNode {
  return pdfText(value, { color: palette.muted, margin: PDF_NOTE_MARGIN });
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

export function pdfGrid(
  palette: ReportPalette,
  widths: (number | "*")[],
  header: string[],
  rows: PdfContent[][],
): PdfContent {
  return {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths,
      body: [header.map((label) => pdfText(label, { bold: true })), ...rows],
    },
    layout: gridLayout(palette, LINE_WIDTH),
  };
}

export function pdfFacts(palette: ReportPalette, rows: [string, string][]): PdfContent[] {
  if (rows.length === 0) return [];

  return [
    {
      table: {
        headerRows: 0,
        dontBreakRows: true,
        widths: [170, "*"],
        body: rows.map(([label, value]) => [pdfText(label, { color: palette.muted }), pdfText(value)]),
      },
      layout: gridLayout(palette, 0),
    },
  ];
}

export function pdfSubheading(value: string): PdfTextNode {
  return pdfText(value, { bold: true, margin: SECTION_MARGIN });
}

export function pdfSection(title: string, body: PdfContent[]): PdfContent[] {
  return body.length === 0
    ? []
    : [pdfText(title, { bold: true, fontSize: SECTION_FONT_SIZE, margin: SECTION_MARGIN }), ...body];
}

/** Полоса доли 0–1 для ячейки таблицы: SVG без текста, поэтому шрифты для неё не нужны. */
export function pdfShareBar(share: number, color: string, palette: ReportPalette): PdfContent {
  const filled = Math.max(0, Math.min(1, share)) * BAR_WIDTH;

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_WIDTH}" height="${BAR_HEIGHT}"><rect width="${BAR_WIDTH}" height="${BAR_HEIGHT}" fill="none" stroke="${palette.line}" stroke-width="0.5"/><rect width="${filled.toFixed(1)}" height="${BAR_HEIGHT}" fill="${color}"/></svg>`,
    width: BAR_WIDTH,
  };
}

export function reportDocument(
  title: string,
  content: PdfContent[],
  palette: ReportPalette,
  generatedAt: Date,
): PdfDocumentDefinition {
  const generated = `Сформировано ${formatDateTime(generatedAt)}`;

  return {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: PAGE_MARGINS,
    info: { title },
    defaultStyle: { font: LATIN_FONT, fontSize: BASE_FONT_SIZE, color: palette.text, lineHeight: 1.2 },
    content,
    footer: (currentPage, pageCount) => ({
      columns: [
        pdfText(generated, { fontSize: SMALL_FONT_SIZE, color: palette.muted }),
        pdfText(`Страница ${currentPage} из ${pageCount}`, {
          fontSize: SMALL_FONT_SIZE,
          color: palette.muted,
          alignment: "right",
        }),
      ],
      margin: FOOTER_MARGIN,
    }),
  };
}

export function reportFileName(name: string, now: Date, extension: "pdf" | "csv"): string {
  return `${name.replace(FORBIDDEN_FILE_CHARACTERS, "_")}_${localDayKey(now)}.${extension}`;
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
export async function downloadPdf(document: PdfDocumentDefinition, fileName: string): Promise<void> {
  const { default: pdfMake } = await import("pdfmake/build/pdfmake");

  pdfMake.setUrlAccessPolicy(isSameOrigin);
  pdfMake.setFonts({
    [LATIN_FONT]: { normal: absoluteUrl(latinRegular), bold: absoluteUrl(latinBold) },
    [CYRILLIC_FONT]: { normal: absoluteUrl(cyrillicRegular), bold: absoluteUrl(cyrillicBold) },
  });

  await pdfMake.createPdf(document).download(fileName);
}
