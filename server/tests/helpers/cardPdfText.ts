import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

const bytesOf = (stream: PDFRawStream) =>
  Buffer.from(decodePDFRawStream(stream).decode()).toString('utf8');
const unicodeOf = (hex: string) =>
  (hex.match(/.{4}/g) ?? []).map((part) => String.fromCharCode(Number.parseInt(part, 16))).join('');

/** Decode the generated PDF's independent ToUnicode maps and text operators, not renderer calls. */
export async function printedPdfText(body: Uint8Array): Promise<string> {
  const document = await PDFDocument.load(body);
  const text: string[] = [];
  for (const page of document.getPages()) {
    const resources = page.node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
    const maps = new Map<string, Map<string, string>>();
    for (const [key, reference] of resources.entries()) {
      const font = document.context.lookup(reference, PDFDict);
      const mapping = document.context.lookup(font.get(PDFName.of('ToUnicode')));
      if (!(mapping instanceof PDFRawStream)) throw new Error('Missing font ToUnicode map');
      const entries = [...bytesOf(mapping).matchAll(/<([0-9a-f]+)>\s+<([0-9a-f]+)>/giu)];
      maps.set(
        key.asString().slice(1),
        new Map(entries.map((entry) => [entry[1]!.toUpperCase(), unicodeOf(entry[2]!)])),
      );
    }
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
    for (const reference of streams) {
      const stream = document.context.lookup(reference!);
      if (!(stream instanceof PDFRawStream)) throw new Error('Missing PDF content stream');
      let current: Map<string, string> | undefined;
      let marked = false;
      for (const operation of bytesOf(stream).matchAll(
        /\/ActualText\s+<([0-9a-f]+)>[^]*?BDC|\b(EMC)\b|\/([^\s]+)\s+[0-9.]+\s+Tf|<([0-9a-f]+)>\s+Tj/giu,
      )) {
        if (operation[1]) {
          text.push(unicodeOf(operation[1]).replace(/^\uFEFF/u, ''));
          marked = true;
        } else if (operation[2]) marked = false;
        else if (operation[3]) current = maps.get(operation[3]);
        else if (!marked)
          text.push(
            (operation[4]!.match(/.{4}/g) ?? [])
              .map((code) => current?.get(code.toUpperCase()) ?? '')
              .join(''),
          );
      }
    }
  }
  return text.join('');
}
