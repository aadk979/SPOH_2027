import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { cancel, enqueue, flush, listEntries } from '@/lib/outbox';

/**
 * P03 bug reproduction: the outbox gives up for good on answers that are not
 * permanent. Skipped until fixed (P07); asserts the correct behaviour and fails
 * today. `api` is mocked at the module boundary, as in tests/outbox.test.ts.
 */

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, api: vi.fn() };
});

const apiModule = await import('@/lib/api');
const mockedApi = vi.mocked(apiModule.api);

beforeEach(async () => {
  for (const entry of await listEntries()) await cancel(entry.id);
});

afterEach(() => {
  mockedApi.mockReset();
});

function capture(key: string): Promise<unknown> {
  return enqueue({
    idempotencyKey: key,
    endpoint: '/registrations',
    body: { stationId: 's1', category: 'SEC_3', idempotencyKey: key },
  });
}

describe('outbox retries (P03 repros)', () => {
  // F03-033
  it('sends a capture queued before the session expired once the volunteer signs back in', async () => {
    await capture('expired-session');

    // The access token lapsed while the phone was offline and the refresh
    // failed: the server answers 401.
    mockedApi.mockRejectedValueOnce(
      new ApiError(401, { code: 'UNAUTHENTICATED', message: 'Sign in', requestId: 'r1' }),
    );
    await flush({ force: true });

    // The volunteer signs in again; the next flush reaches the server.
    mockedApi.mockResolvedValueOnce({});
    await flush({ force: true });

    expect(await listEntries()).toEqual([]);
  });

  // F03-033
  it('retries a capture the server is still settling after a restart', async () => {
    await capture('server-restarted');

    // The server died mid-request; its reservation answers "in progress" for
    // up to a minute, then lets the retry through.
    mockedApi.mockRejectedValueOnce(
      new ApiError(409, {
        code: 'IDEMPOTENCY_IN_PROGRESS',
        message: 'Retry shortly',
        requestId: 'r2',
      }),
    );
    await flush({ force: true });
    mockedApi.mockResolvedValueOnce({});
    await flush({ force: true });

    expect(await listEntries()).toEqual([]);
  });
});

describe('outbox ownership on a shared phone (P04 repro)', () => {
  // F04-003
  it.skip('does not send one volunteer’s queued capture under the next volunteer’s sign-in', async () => {
    // Sam taps while offline, signs out and hands the phone to Alex.
    await capture('queued-by-sam');
    const { clearSession } = await import('@/lib/session');
    clearSession();

    // Alex signs in; every request now carries Alex's token, and the server
    // records Alex as the one who captured it.
    mockedApi.mockResolvedValue({});
    await flush({ force: true });

    expect(mockedApi).not.toHaveBeenCalled();
  });
});
