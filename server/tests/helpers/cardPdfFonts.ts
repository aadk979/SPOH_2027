import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import fontkit, { type Font, type Glyph } from '@pdf-lib/fontkit';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

type OutlineFont = Font & { getGlyph(id: number): Glyph };
type VariableFont = Font & { getVariation(settings: { wght: number }): Font };
type Table = { offset: number; length: number };
type EmbeddedFace = {
  font: OutlineFont;
  bytes: Buffer;
  tables: Map<string, Table>;
  unicode: Map<number, number>;
};

function tablesOf(bytes: Buffer): Map<string, Table> {
  assert.ok(
    [0x00010000, 0x74727565].includes(bytes.readUInt32BE(0)),
    'Embedded font must be TrueType SFNT',
  );
  const count = bytes.readUInt16BE(4);
  assert.ok(12 + count * 16 <= bytes.length, 'Bounded SFNT table directory');
  const tables = new Map<string, Table>();
  for (let index = 0; index < count; index++) {
    const record = 12 + index * 16;
    const table = {
      offset: bytes.readUInt32BE(record + 8),
      length: bytes.readUInt32BE(record + 12),
    };
    assert.ok(table.offset + table.length <= bytes.length, 'Bounded SFNT table');
    tables.set(bytes.toString('ascii', record, record + 4), table);
  }
  for (const name of ['head', 'maxp', 'loca', 'glyf'])
    assert.ok(tables.has(name), `${name} present`);
  return tables;
}

function nonemptyGlyph(face: EmbeddedFace, id: number) {
  const { bytes, tables } = face;
  const glyphCount = bytes.readUInt16BE(tables.get('maxp')!.offset + 4);
  assert.ok(id > 0 && id < glyphCount, 'Chinese CID must index a real glyph, not .notdef');
  const format = bytes.readInt16BE(tables.get('head')!.offset + 50);
  assert.ok(format === 0 || format === 1, 'Valid loca format');
  const stride = format === 0 ? 2 : 4;
  const loca = tables.get('loca')!;
  assert.ok((glyphCount + 1) * stride <= loca.length, 'Bounded loca glyph directory');
  const offset = (glyph: number) =>
    format === 0
      ? bytes.readUInt16BE(loca.offset + glyph * stride) * 2
      : bytes.readUInt32BE(loca.offset + glyph * stride);
  const start = offset(id);
  const end = offset(id + 1);
  const glyf = tables.get('glyf')!;
  assert.ok(
    start + 10 <= end && end <= glyf.length,
    'Chinese glyph has a bounded nonempty outline',
  );
  assert.notEqual(bytes.readInt16BE(glyf.offset + start), 0, 'Chinese glyph has contours');
}

function embeddedFace(document: PDFDocument, dictionary: PDFDict): EmbeddedFace {
  const descendants = dictionary.lookup(PDFName.of('DescendantFonts'), PDFArray);
  const descendant = document.context.lookup(descendants.get(0), PDFDict);
  assert.equal(descendant.lookup(PDFName.of('Subtype'), PDFName).asString(), '/CIDFontType2');
  assert.equal(descendant.lookup(PDFName.of('CIDToGIDMap'), PDFName).asString(), '/Identity');
  const descriptor = descendant.lookup(PDFName.of('FontDescriptor'), PDFDict);
  const program = document.context.lookup(descriptor.get(PDFName.of('FontFile2')));
  assert.ok(program instanceof PDFRawStream, 'TrueType FontFile2 stream present');
  const bytes = Buffer.from(decodePDFRawStream(program).decode());
  const tables = tablesOf(bytes);
  const cmap = document.context.lookup(dictionary.get(PDFName.of('ToUnicode')));
  assert.ok(cmap instanceof PDFRawStream, 'Unicode map present');
  const mappings = Buffer.from(decodePDFRawStream(cmap).decode()).toString('ascii');
  const unicode = new Map(
    [...mappings.matchAll(/<([0-9a-f]{4})>\s+<([0-9a-f]{4})>/giu)].map((entry) => [
      Number.parseInt(entry[1]!, 16),
      Number.parseInt(entry[2]!, 16),
    ]),
  );
  return { bytes, tables, unicode, font: fontkit.create(bytes) as OutlineFont };
}

function compareChineseOutline(face: EmbeddedFace, id: number, original: Font) {
  nonemptyGlyph(face, id);
  const actual = face.font.getGlyph(id).path.bbox;
  const expected = original.glyphForCodePoint(face.unicode.get(id)!).path.bbox;
  assert.ok(actual.width > 0 && actual.height > 0, 'Chinese glyph has visible geometry');
  for (const key of ['minX', 'minY', 'maxX', 'maxY'] as const)
    assert.ok(
      Math.abs(actual[key] - expected[key]) <= 2,
      `Regular Chinese ${key} agrees within TrueType rounding`,
    );
}

/** Inspect real rendered CIDs and font programs; ActualText alone cannot prove visible glyphs. */
export async function inspectPrintedTrueType(body: Uint8Array) {
  const document = await PDFDocument.load(body);
  const source = fontkit.create(
    await readFile(new URL('../../assets/fonts/noto/NotoSansSC-VF.ttf', import.meta.url)),
  ) as VariableFont;
  const original = source.getVariation({ wght: 400 });
  let chineseGlyphCount = 0;
  const fontNames = new Set<string>();
  for (const page of document.getPages()) {
    const dictionaries = page.node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
    const fonts = new Map<string, EmbeddedFace>();
    for (const [key, reference] of dictionaries.entries()) {
      const dictionary = document.context.lookup(reference, PDFDict);
      fontNames.add(dictionary.lookup(PDFName.of('BaseFont'), PDFName).asString());
      fonts.set(key.asString().slice(1), embeddedFace(document, dictionary));
    }
    const contents = page.node.Contents();
    for (const reference of contents instanceof PDFArray ? contents.asArray() : [contents]) {
      const stream = document.context.lookup(reference!);
      assert.ok(stream instanceof PDFRawStream, 'PDF content stream present');
      const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString('ascii');
      let current: EmbeddedFace | undefined;
      for (const operation of operators.matchAll(
        /\/([^\s]+)\s+[0-9.]+\s+Tf|<([0-9a-f]+)>\s+Tj/giu,
      )) {
        if (operation[1]) current = fonts.get(operation[1]);
        else
          for (const hex of operation[2]!.match(/.{4}/gu) ?? []) {
            assert.ok(current, 'Text operator has a font');
            const id = Number.parseInt(hex, 16);
            const point = current.unicode.get(id) ?? 0;
            if (point >= 0x3400 && point <= 0x9fff) {
              compareChineseOutline(current, id, original);
              chineseGlyphCount++;
            }
          }
      }
    }
  }
  return { fontNames: [...fontNames], chineseGlyphCount };
}
