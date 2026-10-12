import sharp from 'sharp';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { escapeCsv } from '../../src/modules/report/application/export/csvCell.js';
import { toCsv } from '../../src/modules/report/application/export/toCsv.js';
import { toXlsx } from '../../src/modules/report/application/export/toXlsx.js';
import { renderCardPdf, renderCardZip } from '../../src/modules/missionCard/application/renderCards.js';
import { CARD_LOGO_AREA } from '../../src/modules/missionCard/application/cardPrintLayout.js';
import { brandingReport } from '../helpers/brandingReport.js';
import type { CardPrintContext } from '../../src/modules/missionCard/domain/printContext.js';

it.each(['=SUM(1,2)', '+formula', '-formula', '@formula', ' \t=payload', '\u0001=payload', '\ufeff@payload'])('protects spreadsheet text %j while preserving numeric counts', (value) => {
  expect(escapeCsv(value).replace(/^"/, '')).toMatch(/^'/);
  expect(escapeCsv(-12)).toBe('-12');
  expect(escapeCsv(0)).toBe('0');
  expect(escapeCsv(null)).toBe('');
});
it('preserves exact counting prose, event metadata and category code/label in properly escaped CSV', () => {
  const report = brandingReport();
  const csv = toCsv(report);
  expect(csv).toContain('"# Registrations, room entries and cards stay separate, even across days."');
  expect(csv).toContain('"# Synthetic, ""event""\nName post-event report"');
  expect(csv).toContain("GROUP_A,'=Synthetic label,2");
  expect(csv).toContain('Frozen branding: unknown');
  expect(csv).not.toContain('Registrations; room entries');
});
async function logoFixture() {
  const body = await sharp({ create: { width: 90, height: 30, channels: 4, background: '#0066cc' } }).png().toBuffer();
  return { body, frozen: { schemaVersion: 1 as const, publicationId: 'frozen-publication', publicationVersion: 3, accent: '#ffffff', logo: { publicationId: 'frozen-publication', variant: 'logo' as const, sha256: createHash('sha256').update(body).digest('hex'), alt: 'Frozen mark' } } };
}
it('embeds the exact frozen PNG into XLSX and keeps formula-looking labels as literal string cells', async () => {
  const { body, frozen } = await logoFixture();
  const report = brandingReport();
  report.event.branding = frozen;
  const bytes = await toXlsx(report, null, { logoPng: body });
  const zip = await JSZip.loadAsync(bytes);
  const image = Object.values(zip.files).find((file) => /^xl\/media\/.*\.png$/.test(file.name));
  expect(image).toBeDefined();
  expect(await image!.async('uint8array')).toEqual(Uint8Array.from(body));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  expect(workbook.worksheets[0]!.getCell('A1').font.color).toEqual({ argb: 'FF000000' });
  expect(workbook.worksheets[0]!.properties.tabColor).toEqual({ argb: 'FFFFFFFF' });
  const registrations = workbook.getWorksheet('Registrations')!;
  expect(registrations.getCell('A6').value).toBe('GROUP_A');
  expect(registrations.getCell('B6').value).toBe('=Synthetic label');
  expect(registrations.getCell('C6').value).toBe(2);
  await expect(toXlsx(report, null, { logoPng: Uint8Array.from([1, 2, 3]) })).rejects.toThrow('frozen');
});
it('embeds the frozen logo in the existing footer reserve while retaining QR images and ZIP context', async () => {
  const { body, frozen } = await logoFixture();
  const card = { shortCode: 'ABC123', qrPayload: 'opaque:synthetic', batchLabel: 'Batch', rehearsal: false };
  const context: CardPrintContext = { eventName: 'Synthetic event', stampingStations: [{ id: 'station', name: 'Stamp station' }], batches: [{ shortCode: card.shortCode, batchLabel: card.batchLabel }], branding: frozen };
  const zip = await JSZip.loadAsync(await renderCardZip([card], context, { logoPng: body }));
  expect(JSON.parse(await zip.file('print-context.json')!.async('string'))).toEqual(context);
  const pdf = await PDFDocument.load(await zip.file('cards.pdf')!.async('uint8array'));
  const images = pdf.context.enumerateIndirectObjects().filter(([, value]) => value instanceof PDFRawStream && value.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'));
  expect(images.length).toBeGreaterThanOrEqual(2);
  expect(CARD_LOGO_AREA).toEqual({ x: 165, y: 8, width: 76, height: 16 });
  await expect(renderCardPdf([card], context, { logoPng: Uint8Array.from([1]) })).rejects.toThrow('frozen');
});
