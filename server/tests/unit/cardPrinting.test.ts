import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import {
  renderCardPdf,
  renderCardZip,
} from '../../src/modules/missionCard/application/renderCards.js';
import { PrintCardBatchRequest, CardPrintExportRecord } from '@spoh/shared';
import { printedPdfText } from '../helpers/cardPdfText.js';
import { inspectPrintedTrueType } from '../helpers/cardPdfFonts.js';
import type { CardPrintContext } from '../../src/modules/missionCard/domain/printContext.js';
import {
  embedCardFonts,
  cardTextRuns,
  cardTextWidth,
  wrapCardText,
  type CardFonts,
} from '../../src/modules/missionCard/application/cardFonts.js';
import {
  cardLayout,
  PAGE_HEIGHT,
  PAGE_MARGIN,
} from '../../src/modules/missionCard/application/cardPrintLayout.js';

const card = {
  shortCode: 'ABC123',
  qrPayload: 'opaque:example',
  batchLabel: 'Print test',
  rehearsal: false,
};
const context: CardPrintContext = {
  eventName: 'Open day',
  stampingStations: [
    { id: 'welcome', name: 'Welcome lounge' },
    { id: 'complete', name: 'Mission complete' },
  ],
  batches: [{ shortCode: card.shortCode, batchLabel: card.batchLabel }],
};
describe('printable mission cards', () => {
  it('uses A4 and preserves a second sheet when standard-height cards exceed the first sheet', async () => {
    const cards = Array.from({ length: 9 }, (_, index) => ({
      ...card,
      shortCode: `TEST${index}0`,
      rehearsal: index % 2 === 0,
    }));
    const pdf = await PDFDocument.load(await renderCardPdf(cards, context));
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getPages()[0]!.getWidth()).toBeCloseTo(595.28);
    expect(pdf.getPages()[0]!.getHeight()).toBeCloseTo(841.89);
  }, 15_000); // Nine real cards include cold font subsetting under whole-suite coverage.
  it('exports the printable PDF with the exact codes and opaque payloads in the CSV', async () => {
    const zip = await JSZip.loadAsync(
      await renderCardZip([card, { ...card, shortCode: 'ABC124', rehearsal: true }], context),
    );
    expect(Object.keys(zip.files).sort()).toEqual([
      'README.txt',
      'cards.csv',
      'cards.pdf',
      'print-context.json',
    ]);
    expect(JSON.parse(await zip.file('print-context.json')!.async('string'))).toEqual(context);
    const csv = await zip.file('cards.csv')!.async('string');
    expect(csv).toContain('ABC123,opaque:example,Print test,LIVE');
    expect(csv).toContain('ABC124,opaque:example,Print test,REHEARSAL');
    expect(
      (await PDFDocument.load(await zip.file('cards.pdf')!.async('uint8array'))).getPageCount(),
    ).toBe(1);
  });
  it('rejects duplicate, empty and oversized requests before any print work', () => {
    const base = { idempotencyKey: crypto.randomUUID(), format: 'pdf' };
    expect(PrintCardBatchRequest.safeParse({ ...base, shortCodes: [] }).success).toBe(false);
    expect(
      PrintCardBatchRequest.safeParse({ ...base, shortCodes: ['ABC123', 'abc123'] }).success,
    ).toBe(false);
    expect(
      PrintCardBatchRequest.safeParse({ ...base, shortCodes: Array(5001).fill('ABC123') }).success,
    ).toBe(false);
    expect(PrintCardBatchRequest.parse({ ...base, shortCodes: ['abc123'] }).shortCodes).toEqual([
      'ABC123',
    ]);
  });
  it('never exposes an object key through the public receipt contract', () => {
    expect(
      CardPrintExportRecord.safeParse({
        id: 'print-test',
        count: 1,
        format: 'pdf',
        rehearsal: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        objectKey: 'private/object',
      }).success,
    ).toBe(false);
  });
  it('embeds subset Unicode fonts and real event, batch, mode and every stamping station label', async () => {
    const multilingual: CardPrintContext = {
      eventName: 'Open day 开放日 தமிழ்',
      stampingStations: [
        { id: 'chinese', name: '人工智能课程体验站' },
        { id: 'tamil', name: 'தமிழ் நிலையம்' },
        { id: 'latin', name: 'Selamat datang — École' },
      ],
      batches: [{ shortCode: card.shortCode, batchLabel: '印刷批次 தமிழ்' }],
    };
    const body = await renderCardPdf(
      [{ ...card, batchLabel: multilingual.batches[0]!.batchLabel }],
      multilingual,
    );
    const text = await printedPdfText(body);
    const fonts = await inspectPrintedTrueType(body);
    expect(fonts.fontNames).toHaveLength(3);
    expect(fonts.chineseGlyphCount).toBeGreaterThan(8);
    expect(text).toContain('Open day');
    expect(text).toContain('开放日');
    expect(text).toContain('தமிழ்');
    expect(text).toContain('印刷批次');
    expect(text).toContain('LIVE');
    expect(text).toContain(card.shortCode);
    for (const station of multilingual.stampingStations)
      expect(text.replace(/\s/gu, '')).toContain(station.name.replace(/\s/gu, ''));
    expect(body.length).toBeLessThan(1_000_000);
  }, 15_000); // Real Unicode subsetting and font inspection run under shared CI CPU load.
  it('wraps long Unicode names, grows cards instead of clipping labels, and retains an unlabelled batch', async () => {
    const fonts = await embedCardFonts(await PDFDocument.create());
    const longContext = {
      ...context,
      eventName: '开放日'.repeat(12),
      stampingStations: Array.from({ length: 14 }, (_, index) => ({
        id: `station-${index}`,
        name: `课程体验站${index} ${'Artificial intelligence and digital skills '.repeat(2)}`,
      })),
    };
    const layout = cardLayout({ ...card, batchLabel: null }, longContext, fonts);
    expect(layout.height).toBeGreaterThan(182);
    expect(layout.height).toBeLessThanOrEqual(PAGE_HEIGHT - PAGE_MARGIN * 2);
    expect(layout.batch.join('')).toContain('Unlabelled');
    expect(layout.rows.flat()).toHaveLength(14);
    expect(layout.event.join('')).toBe(longContext.eventName);
    for (const cell of layout.rows.flat())
      for (const line of cell.lines)
        expect(cardTextWidth(line, layout.stampSize, fonts)).toBeLessThanOrEqual(100.5);
    expect(
      wrapCardText('  long words   and \n lines ', fonts, { size: 9, width: 35 }).join(' '),
    ).toBe('long words and lines');
    expect(wrapCardText('  ', fonts, { size: 9, width: 35 })).toEqual([]);
  }, 15_000); // CJK shaping exceeded four seconds in the same instrumented CI run.
  it('refuses unsupported graphemes and a station grid larger than a physical A4 card', async () => {
    const fonts = await embedCardFonts(await PDFDocument.create());
    expect(() => cardTextRuns('Mission 🦄', fonts)).toThrow('unsupported');
    expect(() => wrapCardText('开放日', fonts, { size: 10, width: 4 })).toThrow('wider');
    expect(() =>
      cardLayout(
        card,
        {
          ...context,
          stampingStations: Array.from({ length: 100 }, (_, index) => ({
            id: String(index),
            name: 'A configured stamping station with a deliberately long label',
          })),
        },
        fonts,
      ),
    ).toThrow('cannot fit');
  });
  it.each([37, 100])('rejects %i stations before accessing fonts or shaping labels', (count) => {
    const fonts: CardFonts = new Proxy([], {
      get() {
        throw new Error('An impossible grid must be rejected before accessing fonts');
      },
    });
    expect(() =>
      cardLayout(
        card,
        {
          ...context,
          stampingStations: Array.from({ length: count }, (_, index) => ({
            id: String(index),
            name: 'Stamping station',
          })),
        },
        fonts,
      ),
    ).toThrow('cannot fit');
  });
  it('shrinks station labels within readable limits when the larger font cannot fit', async () => {
    const fonts = await embedCardFonts(await PDFDocument.create());
    const large = {
      ...context,
      stampingStations: Array.from({ length: 30 }, (_, index) => ({
        id: String(index),
        name: '开放日课程体验与数码科技站',
      })),
    };
    const layout = cardLayout(card, large, fonts);
    expect(layout.stampSize).toBeLessThan(7.5);
    expect(layout.stampSize).toBeGreaterThanOrEqual(6.5);
    expect(layout.rows.flat()).toHaveLength(30);
  });
  it('reflows a carried suffix when the next grapheme exceeds the space removed by a word break', async () => {
    const fonts = await embedCardFonts(await PDFDocument.create());
    const width = cardTextWidth('..W', 10, fonts) - 0.1;
    const lines = wrapCardText('i ..W', fonts, { size: 10, width });
    expect(lines).toEqual(['i', '..', 'W']);
    for (const line of lines) expect(cardTextWidth(line, 10, fonts)).toBeLessThanOrEqual(width);
  });
});
