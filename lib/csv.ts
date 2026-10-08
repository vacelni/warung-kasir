/**
 * CSV writer for the owner's export (PRD §27, SECURITY E.6, TEST_PLAN G.18).
 *
 * RFC 4180 output: comma separator, CRLF line ends, every text cell quoted with inner quotes
 * doubled, so commas, quotes, line breaks, and leading/trailing spaces survive unchanged.
 *
 * Formula injection: a spreadsheet treats a cell that starts with = + - @ (or a tab / carriage
 * return) as a formula, even inside quotes. Such text cells get a leading apostrophe, which makes
 * Excel, LibreOffice, and Google Sheets show the text instead of evaluating it. Text that only
 * reaches a trigger after leading spaces is neutralized too. Numbers and booleans are written
 * raw: they cannot carry a formula, and money stays numeric for spreadsheet sums.
 */

export type CsvCell = string | number | boolean | null;

/** Excel needs the byte order mark to read the file as UTF-8 (names like "Es Teh Manis 🍵", "Bu Sari"). */
export const CSV_BOM = '﻿';

const FORMULA_START = /^\s*[=+\-@]|^[\t\r]/;

/** Prefixes an apostrophe when a spreadsheet would read the text as a formula. */
export function neutralizeFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

export function csvCell(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`Cannot write ${value} to CSV.`);
    return String(value);
  }
  return `"${neutralizeFormula(value).replace(/"/g, '""')}"`;
}

/** Header row plus data rows; every row must have one cell per column. */
export function toCsv(columns: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const [index, row] of rows.entries()) {
    if (row.length !== columns.length) {
      throw new RangeError(`CSV row ${index + 1} has ${row.length} cells; expected ${columns.length}.`);
    }
    lines.push(row.map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
