import { ValidationError } from '../errors/index.js';

function streaming(body: unknown): body is AsyncIterable<Uint8Array> {
  return typeof body === 'object' && body !== null && Symbol.asyncIterator in body;
}

/** Do not allocate an unbounded SDK transformToByteArray buffer before checking its size. */
export async function boundedBytes(body: unknown, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
  if (!streaming(body)) throw new ValidationError('The uploaded object is unavailable.');
  signal?.throwIfAborted();
  const chunks: Buffer[] = [];
  let size = 0;
  const iterator = body[Symbol.asyncIterator]();
  const interrupted = abortableRead(signal);
  try {
    while (true) {
      const next = await Promise.race([iterator.next(), interrupted.promise]);
      if (next.done) break;
      if (!(next.value instanceof Uint8Array)) throw new ValidationError('The uploaded object is unavailable.');
      size += next.value.length;
      if (size > maxBytes) throw new ValidationError('The uploaded image exceeds the byte limit.');
      chunks.push(Buffer.from(next.value));
    }
  } finally {
    interrupted.dispose();
    // SDK streams abort with their request signal; a hostile iterator must not delay refusal.
    void iterator.return?.().catch(() => undefined);
  }
  if (!size) throw new ValidationError('The uploaded object is empty.');
  return Buffer.concat(chunks, size);
}

function abortableRead(signal?: AbortSignal) {
  let reject!: (reason: unknown) => void;
  const promise = new Promise<never>((_, refusal) => { reject = refusal; });
  const abort = () => reject(new ValidationError('The uploaded object read exceeded its deadline.'));
  signal?.addEventListener('abort', abort, { once: true });
  return { promise, dispose: () => signal?.removeEventListener('abort', abort) };
}
