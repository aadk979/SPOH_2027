import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import type { Font } from '@pdf-lib/fontkit';
import {
  PDFHexString,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  beginText,
  endText,
  setFontAndSize,
  setTextMatrix,
  showText,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import 'regenerator-runtime/runtime.js';
import { ValidationError } from '../../../platform/errors/index.js';

const ASSETS = ['NotoSans-Regular.ttf', 'NotoSansSC-VF.ttf', 'NotoSansTamil-Regular.ttf'];
const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
let fontBytes: Promise<Buffer[]> | undefined;

type Face = { font: PDFFont; source: Font; characters: ReadonlySet<number> };
export type CardFonts = readonly Face[];
type TextRun = Face & { text: string };
type DrawOptions = { text: string; x: number; y: number; size: number };
type VariableFont = Font & { getVariation(settings: { wght: number }): Font };

// The pinned SC variable font defaults to Thin. Select Regular before both shaping
// and pdf-lib's subset embedding so the PDF outlines and measured positions agree.
const printFontkit = {
  create(bytes: Uint8Array): Font {
    const font = fontkit.create(bytes) as Font;
    return font.familyName === 'Noto Sans SC'
      ? (font as VariableFont).getVariation({ wght: 400 })
      : font;
  },
};

/** The relative path is identical under src and dist; Docker carries the pinned font assets. */
export async function embedCardFonts(document: PDFDocument): Promise<CardFonts> {
  document.registerFontkit(printFontkit);
  fontBytes ??= Promise.all(
    ASSETS.map((name) =>
      readFile(new URL(`../../../../assets/fonts/noto/${name}`, import.meta.url)),
    ),
  );
  const faces: Face[] = [];
  for (const bytes of await fontBytes) {
    const source = printFontkit.create(bytes);
    const font = await document.embedFont(bytes, { subset: true });
    // Seed one printable glyph so an unused fallback never produces an empty font program.
    font.encodeText(' ');
    faces.push({ font, source, characters: new Set(source.characterSet) });
  }
  return faces;
}

function faceFor(segment: string, fonts: CardFonts): Face {
  const points = Array.from(segment, (character) => character.codePointAt(0)!);
  const face = fonts.find(({ characters }) =>
    points.every((point) => characters.has(point) || point === 0x200d || point === 0x200c),
  );
  if (!face)
    throw new ValidationError(
      'A print label contains a character unsupported by the bundled fonts. Choose a supported label before printing.',
      { codePoints: points.map((point) => `U+${point.toString(16).toUpperCase()}`) },
    );
  return face;
}

/** Keep whole graphemes together, then merge runs so script shaping remains available. */
export function cardTextRuns(text: string, fonts: CardFonts): TextRun[] {
  const runs: TextRun[] = [];
  for (const { segment } of graphemes.segment(text)) {
    const face = faceFor(segment, fonts);
    const previous = runs.at(-1);
    if (previous?.font === face.font) previous.text += segment;
    else runs.push({ ...face, text: segment });
  }
  return runs;
}

const runWidth = (run: TextRun, size: number) =>
  (run.source.layout(run.text).positions.reduce((width, position) => width + position.xAdvance, 0) *
    size) /
  run.source.unitsPerEm;
export const cardTextWidth = (text: string, size: number, fonts: CardFonts) =>
  cardTextRuns(text, fonts).reduce((width, run) => width + runWidth(run, size), 0);

function drawRun(page: PDFPage, run: TextRun, options: DrawOptions) {
  const scale = options.size / run.source.unitsPerEm;
  const shaped = run.source.layout(run.text);
  const codes = run.font.encodeText(run.text).asString().match(/.{4}/gu)!;
  const fontKey = page.node.newFontDictionary(run.font.name, run.font.ref);
  // ActualText preserves logical Unicode order even where shaping reorders glyphs.
  page.pushOperators(
    PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
      PDFName.of('Span'),
      `<< /ActualText ${PDFHexString.fromText(run.text).toString()} >>`,
    ]),
    beginText(),
    setFontAndSize(fontKey, options.size),
  );
  let x = options.x;
  let y = options.y;
  for (const [index, position] of shaped.positions.entries()) {
    page.pushOperators(
      setTextMatrix(1, 0, 0, 1, x + position.xOffset * scale, y + position.yOffset * scale),
      showText(PDFHexString.of(codes[index]!)),
    );
    x += position.xAdvance * scale;
    y += position.yAdvance * scale;
  }
  page.pushOperators(endText(), PDFOperator.of(PDFOperatorNames.EndMarkedContent));
}

export function drawCardText(page: PDFPage, fonts: CardFonts, options: DrawOptions) {
  let x = options.x;
  for (const run of cardTextRuns(options.text, fonts)) {
    drawRun(page, run, { ...options, x });
    x += runWidth(run, options.size);
  }
}

/** Break at word spaces where possible and at complete graphemes for CJK/long words. */
export function wrapCardText(
  text: string,
  fonts: CardFonts,
  { width, size }: { width: number; size: number },
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const { segment } of graphemes.segment(text.replace(/\s+/gu, ' ').trim())) {
    if (cardTextWidth(segment, size, fonts) > width)
      throw new ValidationError('A print label grapheme is wider than its available card space.');
    if (line && cardTextWidth(line + segment, size, fonts) > width) {
      const space = line.lastIndexOf(' ');
      lines.push((space > 0 ? line.slice(0, space) : line).trimEnd());
      const carried = space > 0 ? line.slice(space + 1) : '';
      if (carried && cardTextWidth(carried + segment, size, fonts) > width) {
        lines.push(carried.trimEnd());
        line = segment;
      } else line = carried + segment;
    } else line += segment;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}
