import { createHash } from 'node:crypto';
import type { FullReport } from '@spoh/shared';
import type ExcelJS from 'exceljs';
import { ValidationError } from '../../../../platform/errors/index.js';

export type ExportBrandingAssets = { logoPng?: Uint8Array | null };
function onAccent(hex: string) {
  const luminosity = hex.match(/../g)!.reduce((sum, part, index) => {
    const byte = parseInt(part, 16) / 255;
    return sum + (byte <= 0.04045 ? byte / 12.92 : ((byte + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index]!;
  }, 0);
  return luminosity > 0.179 ? 'FF000000' : 'FFFFFFFF';
}
export function applyWorkbookBranding(workbook: ExcelJS.Workbook, input: { report: FullReport; assets: ExportBrandingAssets }) {
  const frozen = input.report.event.branding;
  if (!frozen) return;
  const colour = frozen.accent.slice(1).toUpperCase();
  for (const sheet of workbook.worksheets) {
    sheet.properties.tabColor = { argb: `FF${colour}` };
    const first = sheet.getRow(1);
    first.font = { ...first.font, color: { argb: onAccent(colour) } };
    first.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${colour}` } };
  }
  if (!input.assets.logoPng) return;
  if (!frozen.logo || createHash('sha256').update(input.assets.logoPng).digest('hex') !== frozen.logo.sha256) throw new ValidationError('The export logo does not match its frozen publication.');
  const id = workbook.addImage({ base64: Buffer.from(input.assets.logoPng).toString('base64'), extension: 'png' });
  const sheet = workbook.worksheets[0]!;
  sheet.insertRows(2, [[], [], []]);
  sheet.addImage(id, { tl: { col: 0, row: 1 }, ext: { width: 120, height: 40 } });
}
