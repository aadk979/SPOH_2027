import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '@/lib/api';
import {
  MAX_ATTEMPTS,
  UNSYNCED_WARNING_COUNT,
  cancel,
  enqueue,
  flush,
  listEntries,
  needsAttention,
  toClipboardText,
  type OutboxEntry,
} from '@/lib/outbox';

/**
 * The outbox (BUILD_PLAN §9.5).
 *
 * The behaviour under test is what makes the counts trustworthy: a tap is
 * durable before the network is touched, retries are safe because the
 * idempotency key never changes, and a permanent failure surfaces to a human
 * rather than looping forever.
 */

/**
 * The api module is mocked at the module boundary rather than spied on: the
 * outbox imports `api` as a live ESM binding, and reassigning a property on the
 * namespace object would not rebind it.
 */
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: vi.fn() };
});

const apiModule = await import('@/lib/api');
const mockedApi = vi.mocked(apiModule.api);

async function clearOutbox(): Promise<void> {
  for (const entry of await listEntries()) {
    // `cancel` refuses entries mid-send, which is exactly what we want between
    // tests; anything left is drained by deleting the database instead.
    await cancel(entry.id);
  }
  const remaining = await listEntries();
  if (remaining.length > 0) indexedDB.deleteDatabase('spoh2027');
}

beforeEach(async () => {
  await clearOutbox();
});

afterEach(() => {
  mockedApi.mockReset();
});

/**
 * Send now, skipping the undo grace period and any backoff — the same path the
 * "Try again now" button takes.
 *
 * Deliberately not `vi.useFakeTimers()`: faking timers freezes the event loop
 * that IndexedDB runs on, so every database call after it would hang.
 */
async function flushNow(): Promise<void> {
  await flush({ force: true });
}

/**
 * Mirrors what `useCapture` enqueues: the key is both the entry id and a field
 * in the body, because the server reads it from the body.
 */
function tap(overrides: Partial<{ endpoint: string; body: object }> = {}): Promise<OutboxEntry> {
  const idempotencyKey = crypto.randomUUID();
  return enqueue({
    idempotencyKey,
    endpoint: overrides.endpoint ?? '/registrations',
    body: {
      category: 'SEC_4',
      stationId: 'station-1',
      ...overrides.body,
      idempotencyKey,
      clientRecordedAt: new Date().toISOString(),
    },
  });
}

describe('enqueue', () => {
  it('persists the tap before any network call is made', async () => {
    // No api stub at all: even if the send fails outright, the tap survives.
    const entry = await tap();

    const stored = await listEntries();
    expect(stored.map((e) => e.id)).toContain(entry.id);
  });

  it('uses the idempotency key as the entry id, so a retry cannot duplicate', async () => {
    const key = crypto.randomUUID();
    await enqueue({ idempotencyKey: key, endpoint: '/registrations', body: {} });
    await enqueue({ idempotencyKey: key, endpoint: '/registrations', body: {} });

    // The same key is the same row. Two enqueues of one logical tap is one
    // entry, and the server would collapse them anyway.
    const stored = await listEntries();
    expect(stored.filter((e) => e.id === key)).toHaveLength(1);
  });
});

describe('flush', () => {
  it('removes an entry once the server accepts it', async () => {
    mockedApi.mockResolvedValue({});

    await tap();
    await flushNow();

    expect(mockedApi).toHaveBeenCalled();
    expect(await listEntries()).toHaveLength(0);
  });

  it('keeps an entry pending after a network failure', async () => {
    mockedApi.mockRejectedValue(new NetworkError(new Error('offline')));

    await tap();
    await flushNow();

    const [entry] = await listEntries();
    expect(entry?.status).toBe('pending');
    expect(entry?.attempts).toBe(1);
  });

  it('gives up immediately on a 4xx, which will never succeed', async () => {
    mockedApi.mockRejectedValue(
      new ApiError(400, { code: 'VALIDATION_FAILED', message: 'bad', requestId: 'r1' }),
    );

    await tap();
    await flushNow();

    const [entry] = await listEntries();
    // Retrying a validation failure ten times burns battery and hides the real
    // problem from the volunteer and their IC.
    expect(entry?.status).toBe('failed');
    expect(entry?.attempts).toBe(1);
  });

  it('retries a 5xx rather than discarding the tap', async () => {
    mockedApi.mockRejectedValue(
      new ApiError(503, { code: 'SERVICE_UNAVAILABLE', message: 'down', requestId: 'r1' }),
    );

    await tap();
    await flushNow();

    const [entry] = await listEntries();
    expect(entry?.status).toBe('pending');
  });

  it('sends the same idempotency key on every attempt', async () => {
    mockedApi.mockRejectedValueOnce(new NetworkError(new Error('offline'))).mockResolvedValue({});

    const entry = await tap();
    await flushNow();
    // The retry: same entry, same key, second attempt.
    await flushNow();

    const keys = mockedApi.mock.calls.map(
      (call) => (call[1]?.body as { idempotencyKey?: string } | undefined)?.idempotencyKey,
    );

    // This is the property the whole design rests on. If the key changed
    // between attempts, every retry would create a second registration.
    expect(mockedApi).toHaveBeenCalledTimes(2);
    expect(keys).toEqual([entry.id, entry.id]);
  });
});

describe('cancel', () => {
  it('removes an unsent entry, which is what undo does', async () => {
    // Undo lands inside the grace period, before the first send attempt.
    const entry = await tap();

    expect(await cancel(entry.id)).toBe(true);
    expect(await listEntries()).toHaveLength(0);
  });

  it('reports false for an entry that is not there', async () => {
    expect(await cancel(crypto.randomUUID())).toBe(false);
  });
});

describe('needsAttention', () => {
  const base: OutboxEntry = {
    id: 'x',
    endpoint: '/registrations',
    method: 'POST',
    body: {},
    clientRecordedAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    status: 'pending',
    lastError: null,
  };

  it('is quiet when everything is flowing', () => {
    expect(needsAttention([])).toBe(false);
    expect(needsAttention([base])).toBe(false);
  });

  it('raises when the queue is backing up', () => {
    const many = Array.from({ length: UNSYNCED_WARNING_COUNT + 1 }, (_unused, index) => ({
      ...base,
      id: String(index),
    }));
    expect(needsAttention(many)).toBe(true);
  });

  it('raises when the oldest tap has been stuck for five minutes', () => {
    const stale = {
      ...base,
      clientRecordedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    };
    expect(needsAttention([stale])).toBe(true);
  });

  it('raises as soon as anything has failed for good', () => {
    expect(needsAttention([{ ...base, status: 'failed', attempts: MAX_ATTEMPTS }])).toBe(true);
  });
});

describe('toClipboardText', () => {
  it('produces tab-separated rows an IC can paste into the fallback sheet', () => {
    const text = toClipboardText([
      {
        id: 'a',
        endpoint: '/footfall/ticks',
        method: 'POST',
        body: { stationId: 's1' },
        clientRecordedAt: '2027-01-07T03:30:00.000Z',
        attempts: 10,
        lastAttemptAt: '2027-01-07T03:35:00.000Z',
        status: 'failed',
        lastError: 'Could not reach the server',
      },
    ]);

    const [row] = text.split('\n');
    expect(row?.split('\t')).toEqual([
      '2027-01-07T03:30:00.000Z',
      '/footfall/ticks',
      '{"stationId":"s1"}',
      'attempts=10',
      'Could not reach the server',
    ]);
  });
});
