import { generateQrPayload, generateShortCode } from './shortCode.js';

export interface BatchRow {
  shortCode: string;
  qrPayload: string;
  batchLabel: string;
}

/** `count` cards with distinct random short codes, for one print run. */
export function generateBatchRows(count: number, batchLabel: string): BatchRow[] {
  const rows: BatchRow[] = [];
  const seen = new Set<string>();
  while (rows.length < count) {
    const shortCode = generateShortCode();
    if (seen.has(shortCode)) continue;
    seen.add(shortCode);
    rows.push({ shortCode, qrPayload: generateQrPayload(), batchLabel });
  }
  return rows;
}

/** The file that goes to the printer. */
export function toBatchCsv(rows: readonly BatchRow[]): string {
  return [
    'shortCode,qrPayload,batchLabel',
    ...rows.map((row) => `${row.shortCode},${row.qrPayload},${row.batchLabel}`),
  ].join('\n');
}
