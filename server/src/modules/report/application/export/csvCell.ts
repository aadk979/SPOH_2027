export type CsvCell = string | number | null;
/** Literal text stays text in spreadsheet applications; numeric counts remain numeric. */
export function escapeCsv(value: CsvCell): string {
  if (value === null) return '';
  const raw = String(value);
  // eslint-disable-next-line no-control-regex -- Spreadsheet applications skip ASCII control prefixes before formula characters.
  const text = typeof value === 'string' && /^[\s\u0000-\u0020\ufeff]*[=+@-]/u.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
