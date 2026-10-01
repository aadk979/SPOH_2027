import { generateQrPayload, generateShortCode } from './shortCode.js';

export interface BatchRow {
  shortCode: string;
  qrPayload: string;
  batchLabel: string;
  rehearsal: boolean;
}

/** `count` cards with distinct random short codes, for one print run. */
export function generateBatchRows(
  count: number,
  batch: { batchLabel: string; rehearsal: boolean },
): BatchRow[] {
  const rows: BatchRow[] = [];
  const seen = new Set<string>();
  while (rows.length < count) {
    const shortCode = generateShortCode();
    if (seen.has(shortCode)) continue;
    seen.add(shortCode);
    rows.push({ shortCode, qrPayload: generateQrPayload(), ...batch });
  }
  return rows;
}

/** The file that goes to the printer. */
export function toBatchCsv(rows: readonly BatchRow[]): string {
  return [
    'shortCode,qrPayload,batchLabel,mode',
    ...rows.map((row) =>
      [
        row.shortCode,
        row.qrPayload,
        printLabel(row.batchLabel),
        row.rehearsal ? 'REHEARSAL' : 'LIVE',
      ].join(','),
    ),
  ].join('\n');
}

/** A label stays one cell and cannot become a spreadsheet formula when opened for printing. */
function printLabel(label: string): string {
  const text = /^[\s]*[=+@-]/.test(label) ? `'${label}` : label;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
