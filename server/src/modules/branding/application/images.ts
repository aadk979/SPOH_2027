import sharp, { type Metadata } from 'sharp';
import type { BrandingVariant } from '@spoh/shared';
import { ValidationError } from '../../../platform/errors/index.js';

const MAX_PIXELS = 8_000_000;
const MAX_BYTES = 1024 * 1024;
const formats: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };
export type NormalizedImages = Array<{ variant: BrandingVariant; body: Uint8Array }>;
function checkMetadata(metadata: Metadata, contentType: string) {
  if (metadata.format !== formats[contentType] || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096)
    throw new ValidationError('Upload a single PNG, JPEG or WebP image, at most 4096 pixels on either side.');
}
export async function normalizeBrandingImage(input: { body: Uint8Array; contentType: string }): Promise<NormalizedImages> {
  if (!input.body.length || input.body.length > MAX_BYTES) throw new ValidationError('Upload a logo smaller than 1 MB.');
  try {
    const image = sharp(input.body, { limitInputPixels: MAX_PIXELS, failOn: 'error', animated: true });
    const metadata = await image.metadata();
    checkMetadata(metadata, input.contentType);
    const rotated = image.rotate();
    const logo = await rotated.clone().resize(480, 160, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    const small = await rotated.clone().resize(192, 192, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
    const large = await rotated.clone().resize(512, 512, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
    const inset = await rotated.clone().resize(320, 320, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
    const maskable = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#ffffff' } }).composite([{ input: inset, left: 96, top: 96 }]).png().toBuffer();
    const results: NormalizedImages = [{ variant: 'logo', body: logo }, { variant: 'icon-192', body: small }, { variant: 'icon-512', body: large }, { variant: 'maskable-512', body: maskable }];
    if (results.some((result) => result.body.length > MAX_BYTES) || results.reduce((sum, result) => sum + result.body.length, 0) > 2 * MAX_BYTES)
      throw new ValidationError('The normalized logo is too large. Upload a simpler image.');
    return results;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('The logo cannot be decoded safely. Export it as a single PNG and upload it again.');
  }
}
