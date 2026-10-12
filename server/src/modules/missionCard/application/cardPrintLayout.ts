import { rgb, type PDFPage } from 'pdf-lib';
import { ValidationError } from '../../../platform/errors/index.js';
import type { CardPrintContext, PrintableCard } from '../domain/printContext.js';
import { drawCardText, wrapCardText, type CardFonts } from './cardFonts.js';

export const CARD_WIDTH = 253;
export const PAGE_HEIGHT = 841.89;
export const PAGE_MARGIN = 34;
/** Branding uses the existing right footer reserve, below stamp boxes and away from QR quiet zones. */
export const CARD_LOGO_AREA = { x: 165, y: 8, width: 76, height: 16 } as const;
const CELL_WIDTH = 110.5;
const STAMP_COLUMNS = 2;
const CARD_TOP_INSET = 16;
const MIN_HEADER_HEIGHT = 84;
const CODE_HEIGHT = 48;
const GRID_TOP_GAP = 8;
const CELL_RESERVED_HEIGHT = 28;
const ROW_GAP = 6;
const FOOTER_HEIGHT = 28;
type Cell = { lines: string[]; x: number; height: number };
export type CardLayout = {
  height: number;
  headerHeight: number;
  event: string[];
  batch: string[];
  rows: Cell[][];
  stampSize: number;
};

function stationRows(context: CardPrintContext, fonts: CardFonts, stampSize: number) {
  const rows: Cell[][] = [];
  for (const [index, station] of context.stampingStations.entries()) {
    if (index % STAMP_COLUMNS === 0) rows.push([]);
    const lines = wrapCardText(station.name, fonts, { width: CELL_WIDTH - 10, size: stampSize });
    rows.at(-1)!.push({
      lines,
      x: (index % STAMP_COLUMNS) * (CELL_WIDTH + 8),
      height: lines.length * (stampSize + 1.5) + CELL_RESERVED_HEIGHT,
    });
  }
  return rows;
}

function cannotFitCard() {
  return new ValidationError(
    'The configured station labels cannot fit on an A4 mission card. Shorten the labels or reduce the stamping stations before printing.',
  );
}

function assertGridCanFit(stationCount: number) {
  const minimumGridHeight =
    Math.ceil(stationCount / STAMP_COLUMNS) * (CELL_RESERVED_HEIGHT + ROW_GAP);
  const minimumHeight =
    CARD_TOP_INSET + MIN_HEADER_HEIGHT + GRID_TOP_GAP + minimumGridHeight + FOOTER_HEIGHT;
  if (minimumHeight > PAGE_HEIGHT - PAGE_MARGIN * 2) throw cannotFitCard();
}

export function cardLayout(
  card: PrintableCard,
  context: CardPrintContext,
  fonts: CardFonts,
): CardLayout {
  assertGridCanFit(context.stampingStations.length);
  const event = wrapCardText(context.eventName, fonts, { width: 135, size: 9 });
  const batch = wrapCardText(`Batch: ${card.batchLabel ?? 'Unlabelled'}`, fonts, {
    width: 135,
    size: 8,
  });
  const headerHeight = 11 + event.length * 11 + batch.length * 10;
  for (const stampSize of [7.5, 7, 6.5]) {
    const rows = stationRows(context, fonts, stampSize);
    const gridHeight = rows.reduce(
      (sum, row) => sum + Math.max(...row.map((cell) => cell.height)) + ROW_GAP,
      0,
    );
    const height = Math.max(
      182,
      CARD_TOP_INSET +
        Math.max(MIN_HEADER_HEIGHT, headerHeight + CODE_HEIGHT) +
        GRID_TOP_GAP +
        gridHeight +
        FOOTER_HEIGHT,
    );
    if (height <= PAGE_HEIGHT - PAGE_MARGIN * 2)
      return { height, headerHeight, event, batch, rows, stampSize };
  }
  throw cannotFitCard();
}

function lines(
  page: PDFPage,
  fonts: CardFonts,
  input: { text: readonly string[]; x: number; y: number; size: number; gap: number },
) {
  for (const [index, text] of input.text.entries())
    drawCardText(page, fonts, { ...input, text, y: input.y - index * input.gap });
}

export function drawCardLabels(
  page: PDFPage,
  fonts: CardFonts,
  input: { card: PrintableCard; layout: CardLayout; x: number; y: number },
) {
  const { card, layout, x, y } = input;
  const top = y + layout.height - CARD_TOP_INSET;
  drawCardText(page, fonts, {
    text: `Mission card · ${card.rehearsal ? 'REHEARSAL' : 'LIVE'}`,
    x: x + 12,
    y: top,
    size: 10,
  });
  lines(page, fonts, { text: layout.event, x: x + 12, y: top - 12, size: 9, gap: 11 });
  lines(page, fonts, {
    text: layout.batch,
    x: x + 12,
    y: top - 12 - layout.event.length * 11,
    size: 8,
    gap: 10,
  });
  drawCardText(page, fonts, {
    text: card.shortCode,
    x: x + 12,
    y: top - layout.headerHeight - 25,
    size: 24,
  });
  drawCardText(page, fonts, {
    text: 'One card = one journey',
    x: x + 12,
    y: top - layout.headerHeight - 38,
    size: 8,
  });
  drawCardText(page, fonts, {
    text: 'Keep this card for your stamps.',
    x: x + 12,
    y: y + 17,
    size: 8,
  });
  drawStampGrid(page, fonts, {
    layout,
    x: x + 12,
    y: top - Math.max(MIN_HEADER_HEIGHT, layout.headerHeight + CODE_HEIGHT) - GRID_TOP_GAP,
  });
}

function drawStampGrid(
  page: PDFPage,
  fonts: CardFonts,
  input: { layout: CardLayout; x: number; y: number },
) {
  let y = input.y;
  for (const row of input.layout.rows) {
    const height = Math.max(...row.map((cell) => cell.height));
    for (const cell of row) {
      page.drawRectangle({
        x: input.x + cell.x,
        y: y - height,
        width: CELL_WIDTH,
        height,
        borderWidth: 0.5,
        borderColor: rgb(0.7, 0.7, 0.7),
      });
      lines(page, fonts, {
        text: cell.lines,
        x: input.x + cell.x + 5,
        y: y - 10,
        size: input.layout.stampSize,
        gap: input.layout.stampSize + 1.5,
      });
    }
    y -= height + ROW_GAP;
  }
  if (input.layout.rows.length === 0)
    drawCardText(page, fonts, {
      text: 'No stamping stations configured',
      x: input.x,
      y: y - 10,
      size: 7.5,
    });
}
