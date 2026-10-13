import { createHash } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import type { UploadContentType } from '@spoh/shared';
import { ServiceUnavailableError, ValidationError } from '../errors/index.js';

export interface ValidatedImage {
  body: Buffer; contentType: UploadContentType; contentLength: number; sha256: string;
}
const MAX_PIXELS = 16_000_000;
const MAX_CONCURRENT_DECODES = 2;
let decoding = 0;
const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' } as const;
function matchesMagic(body: Buffer, type: UploadContentType): boolean {
  if (type === 'image/jpeg') return body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (type === 'image/png') return body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return body.length >= 12 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP'
    && body.readUInt32LE(4) + 8 === body.length;
}

function assertImageInput(input: { body: Buffer; contentType: UploadContentType; maxBytes: number }): void {
  if (!input.body.length || input.body.length > input.maxBytes || !matchesMagic(input.body, input.contentType))
    throw new ValidationError('The upload is not a supported complete image.');
}
function assertStillImage(metadata: Metadata, contentType: UploadContentType): void {
  if (metadata.format !== formats[contentType] || !metadata.width || !metadata.height ||
    metadata.width * metadata.height > MAX_PIXELS || (metadata.pages ?? 1) !== 1)
    throw new ValidationError('Use one still image within the image dimensions limit.');
}

/** Full decode and a fresh encoding discard metadata, trailing payloads and active content. */
export async function normalizeImage(input: {
  body: Buffer; contentType: UploadContentType; maxBytes: number;
}): Promise<ValidatedImage> {
  assertImageInput(input);
  if (decoding >= MAX_CONCURRENT_DECODES) throw new ServiceUnavailableError('Image processing is busy. Retry shortly.');
  decoding += 1;
  try {
    const image = sharp(input.body, { animated: true, limitInputPixels: MAX_PIXELS, failOn: 'warning' })
      .timeout({ seconds: 5 });
    const metadata = await image.metadata();
    assertStillImage(metadata, input.contentType);
    const body = await image.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .toFormat(formats[input.contentType]).toBuffer();
    if (!body.length || body.length > input.maxBytes)
      throw new ValidationError('The normalized image exceeds the upload limit.');
    return { body, contentType: input.contentType, contentLength: body.length,
      sha256: createHash('sha256').update(body).digest('hex') };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('The upload could not be completely decoded as a still image.');
  } finally { decoding -= 1; }
}
