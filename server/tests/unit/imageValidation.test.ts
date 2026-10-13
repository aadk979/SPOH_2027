import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalizeImage } from '../../src/platform/uploads/validatedImage.js';
import { boundedBytes } from '../../src/platform/uploads/boundedBytes.js';

const image = (format: 'png' | 'jpeg' | 'webp') => sharp({ create: {
  width: 3, height: 2, channels: 3, background: '#1267ab',
} }).toFormat(format).toBuffer();
const stream = async function* (chunks: unknown[]) { for (const chunk of chunks) yield chunk; };

describe('bounded object bytes', () => {
  it('counts streamed bytes before buffering and closes a refused iterator', async () => {
    let closed = false;
    async function* oversized() {
      try { yield Buffer.alloc(2); yield Buffer.alloc(3); } finally { closed = true; }
    }
    await expect(boundedBytes(oversized(), 4)).rejects.toMatchObject({ statusCode: 400 });
    expect(closed).toBe(true);
    expect(await boundedBytes(stream([Buffer.from('ab'), Buffer.from('cd')]), 4)).toEqual(Buffer.from('abcd'));
  });
  it.each([undefined, {}, stream([]), stream(['not bytes'])])('refuses missing, empty or non-byte streams', async (body) => {
    await expect(boundedBytes(body, 10)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('interrupts a body that never produces its next chunk at the read deadline', async () => {
    let closed = false;
    const body = { [Symbol.asyncIterator]: () => ({
      next: () => new Promise<IteratorResult<Uint8Array>>(() => undefined),
      return: async () => { closed = true; return { done: true as const, value: undefined }; },
    }) };
    const controller = new AbortController();
    const pending = boundedBytes(body, 100, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ statusCode: 400 });
    expect(closed).toBe(true);
  });
  it('refuses an already-aborted request before pulling the stream', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(boundedBytes(stream([Buffer.from('x')]), 10, controller.signal)).rejects.toBeDefined();
  });
});

describe('complete raster decode and fresh encoding', () => {
  it.each(['png', 'jpeg', 'webp'] as const)('fully decodes %s and records the normalized bytes digest', async (format) => {
    const body = await image(format);
    const normalized = await normalizeImage({ body, contentType: `image/${format}`, maxBytes: 100_000 });
    expect(normalized.sha256).toBe(createHash('sha256').update(normalized.body).digest('hex'));
    expect(normalized.contentLength).toBe(normalized.body.length);
    expect(await sharp(normalized.body).metadata()).toMatchObject({ format, width: 3, height: 2 });
  });
  it('strips an active trailing payload and image metadata rather than publishing uploaded bytes', async () => {
    const body = await sharp(await image('jpeg')).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const tagged = Buffer.concat([body, Buffer.from('<script>synthetic-payload</script>')]);
    const normalized = await normalizeImage({ body: tagged, contentType: 'image/jpeg', maxBytes: 100_000 });
    expect(normalized.body.includes(Buffer.from('synthetic-payload'))).toBe(false);
    const metadata = await sharp(normalized.body).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(metadata).toMatchObject({ width: 2, height: 3 });
  });
  it('refuses declared raster HTML, mismatched magic, truncated decode and byte overflow', async () => {
    const body = await image('png');
    for (const hostile of [Buffer.from('<html>active</html>'), body.subarray(0, 40)])
      await expect(normalizeImage({ body: hostile, contentType: 'image/png', maxBytes: 100_000 }))
        .rejects.toMatchObject({ statusCode: 400 });
    await expect(normalizeImage({ body, contentType: 'image/jpeg', maxBytes: 100_000 }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(normalizeImage({ body, contentType: 'image/png', maxBytes: body.length - 1 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
  it('refuses a valid image whose dimensions exceed the decode pixel ceiling', async () => {
    const body = await sharp({ create: { width: 4001, height: 4000, channels: 3,
      background: '#000000' } }).png().toBuffer();
    await expect(normalizeImage({ body, contentType: 'image/png', maxBytes: 1_000_000 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
  it('refuses a multi-frame WebP even when its declared MIME and magic are valid', async () => {
    // Distinct frames prevent the WebP encoder coalescing identical frames into one still image.
    const body = await sharp(Buffer.from([255, 0, 0, 0, 0, 255]), {
      raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
    }).webp({ lossless: true, delay: [100, 200] }).toBuffer();
    expect((await sharp(body, { animated: true }).metadata()).pages).toBe(2);
    await expect(normalizeImage({ body, contentType: 'image/webp', maxBytes: 100_000 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
  it('bounds simultaneous decodes and releases the capacity after success and refusal', async () => {
    const body = await image('png');
    const input = { body, contentType: 'image/png' as const, maxBytes: 100_000 };
    const first = normalizeImage(input); const second = normalizeImage(input);
    await expect(normalizeImage(input)).rejects.toMatchObject({ statusCode: 503 });
    await Promise.all([first, second]);
    await expect(normalizeImage(input)).resolves.toHaveProperty('sha256');
    await expect(normalizeImage({ ...input, body: body.subarray(0, 40) })).rejects.toBeDefined();
    await expect(normalizeImage(input)).resolves.toHaveProperty('sha256');
  });
});
