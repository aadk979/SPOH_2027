import { PDFDocument, rgb, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { ValidationError } from '../../../platform/errors/index.js';
import { toBatchCsv } from '../domain/cardBatch.js';
import type { CardPrintContext, PrintableCard } from '../domain/printContext.js';
import { embedCardFonts } from './cardFonts.js';
import {
  CARD_WIDTH,
  CARD_LOGO_AREA,
  PAGE_HEIGHT,
  PAGE_MARGIN,
  cardLayout,
  drawCardLabels,
} from './cardPrintLayout.js';

export type CardBrandingAssets = { logoPng?: Uint8Array | null };
async function embedFrozenLogo(document: PDFDocument, input: { context: CardPrintContext; assets: CardBrandingAssets }) {
  const bytes = input.assets.logoPng;
  if (!bytes) return null;
  if (!input.context.branding?.logo || createHash('sha256').update(bytes).digest('hex') !== input.context.branding.logo.sha256)
    throw new ValidationError('The printed logo does not match its frozen publication.');
  return document.embedPng(bytes);
}

export async function renderCardPdf(
  cards: readonly PrintableCard[],
  context: CardPrintContext,
  assets: CardBrandingAssets = {},
): Promise<Buffer> {
  const document = await PDFDocument.create();
  const fonts = await embedCardFonts(document);
  const logo = await embedFrozenLogo(document, { context, assets });
  const layouts = cards.map((card) => cardLayout(card, context, fonts));
  const height = Math.max(...layouts.map((layout) => layout.height));
  const perPage = Math.floor((PAGE_HEIGHT - PAGE_MARGIN * 2 + 6) / (height + 6)) * 2;
  let page: PDFPage | undefined;
  for (const [index, card] of cards.entries()) {
    const slot = index % perPage;
    if (slot === 0) page = document.addPage([595.28, PAGE_HEIGHT]);
    const position = {
      x: PAGE_MARGIN + (slot % 2) * 274,
      y: PAGE_HEIGHT - PAGE_MARGIN - height - Math.floor(slot / 2) * (height + 6),
    };
    const layout = { ...layouts[index]!, height };
    page!.drawRectangle({
      ...position,
      width: CARD_WIDTH,
      height,
      borderWidth: 0.5,
      borderColor: accentColour(context),
    });
    drawCardLabels(page!, fonts, { card, layout, ...position });
    if (logo) {
      const dimensions = logo.scale(Math.min(CARD_LOGO_AREA.width / logo.width, CARD_LOGO_AREA.height / logo.height));
      page!.drawImage(logo, { x: position.x + CARD_LOGO_AREA.x, y: position.y + CARD_LOGO_AREA.y, ...dimensions });
    }
    const qr = await document.embedPng(
      await QRCode.toBuffer(card.qrPayload, { width: 192, margin: 2, errorCorrectionLevel: 'M' }),
    );
    page!.drawImage(qr, {
      x: position.x + 165,
      y: position.y + height - 92,
      width: 76,
      height: 76,
    });
  }
  return Buffer.from(await document.save());
}

export async function renderCardZip(
  cards: readonly PrintableCard[],
  context: CardPrintContext,
  assets: CardBrandingAssets = {},
): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('cards.pdf', await renderCardPdf(cards, context, assets));
  zip.file(
    'cards.csv',
    toBatchCsv(cards.map((card) => ({ ...card, batchLabel: card.batchLabel ?? '' }))),
  );
  zip.file('print-context.json', JSON.stringify(context, null, 2));
  zip.file(
    'README.txt',
    'Print cards.pdf at actual size on A4 paper. Each QR contains an opaque card identifier. Every card names its event, batch, mode and configured stamping stations. Rehearsal cards are excluded from live reports. Print context records the labels frozen with this export.\n',
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function accentColour(context: CardPrintContext) {
  const hex = context.branding?.accent;
  if (!hex) return rgb(0.6, 0.6, 0.6);
  const bytes = hex.slice(1).match(/../g)!.map((part) => parseInt(part, 16) / 255);
  return rgb(bytes[0]!, bytes[1]!, bytes[2]!);
}
