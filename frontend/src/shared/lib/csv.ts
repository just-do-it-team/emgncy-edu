const BOM = "﻿";
const SEPARATOR = ";";
const LINE_END = "\r\n";
const NEEDS_QUOTES = /[";\r\n]/;

function cell(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV для Excel с русской локалью: UTF-8 с BOM, разделитель «;», строки через CRLF. */
export function toCsv(header: string[], rows: string[][]): string {
  return BOM + [header, ...rows].map((row) => row.map(cell).join(SEPARATOR)).join(LINE_END) + LINE_END;
}

export function downloadCsv(fileName: string, header: string[], rows: string[][]): void {
  const url = URL.createObjectURL(new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
