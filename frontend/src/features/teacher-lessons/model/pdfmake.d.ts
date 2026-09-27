declare module "pdfmake/build/pdfmake" {
  export type PdfMargin = [number, number, number, number];

  export interface PdfTextRun {
    text: string;
    font: string;
  }

  export interface PdfTextNode {
    text: PdfTextRun[];
    bold?: boolean;
    color?: string;
    fontSize?: number;
    alignment?: "left" | "right";
    margin?: PdfMargin;
  }

  export interface PdfTableLayout {
    hLineWidth: () => number;
    vLineWidth: () => number;
    hLineColor: () => string;
    vLineColor: () => string;
    paddingLeft: () => number;
    paddingRight: () => number;
    paddingTop: () => number;
    paddingBottom: () => number;
  }

  export interface PdfTableNode {
    table: {
      headerRows: number;
      dontBreakRows: boolean;
      widths: (number | "*" | "auto")[];
      body: PdfTextNode[][];
    };
    layout: PdfTableLayout;
    margin?: PdfMargin;
  }

  export interface PdfColumnsNode {
    columns: PdfTextNode[];
    margin?: PdfMargin;
  }

  export type PdfContent = PdfTextNode | PdfTableNode | PdfColumnsNode;

  export interface PdfFontFamily {
    normal: string;
    bold: string;
  }

  export interface PdfDocumentDefinition {
    pageSize: "A4";
    pageOrientation: "portrait" | "landscape";
    pageMargins: PdfMargin;
    info: { title: string };
    defaultStyle: { font: string; fontSize: number; color: string; lineHeight: number };
    content: PdfContent[];
    footer: (currentPage: number, pageCount: number) => PdfContent;
  }

  interface PdfMake {
    setFonts(fonts: Record<string, PdfFontFamily>): void;
    setUrlAccessPolicy(policy: (url: string) => boolean): void;
    createPdf(definition: PdfDocumentDefinition): { download(fileName: string): Promise<void> };
  }

  const pdfMake: PdfMake;

  export default pdfMake;
}
