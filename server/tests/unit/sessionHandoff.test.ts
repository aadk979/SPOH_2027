import { beforeEach, expect, it, vi } from 'vitest';
import { fixedClock } from '../../src/platform/time/index.js';

const database = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  insert: vi.fn(),
}));
vi.mock('../../src/platform/db/client.js', () => ({
  prisma: { $transaction: database.transaction },
}));
vi.mock('../../src/modules/auth/data/handoffRepo.js', () => ({
  lockHandoffSession: database.lock,
  insertHandoff: database.insert,
}));
const { createSessionHandoff } = await import('../../src/modules/auth/application/createSessionHandoff.js');
const now = new Date('2027-01-07T03:30:00Z');
const input = { sessionId: 'session', sub: 'owner', challenge: 'challenge' };
const currentSession = () => ({
  revokedAt: null,
  expiresAt: new Date(now.getTime() + 120_000),
  absoluteExpiresAt: null,
  volunteer: { cognitoSub: 'owner' },
});

beforeEach(() => {
  vi.resetAllMocks();
  database.transaction.mockImplementation(async (run: (tx: object) => Promise<string>) => run({}));
  database.lock.mockResolvedValue(currentSession());
});

it.each([
  ['missing', null],
  ['expired', { ...currentSession(), expiresAt: now }],
  ['revoked', { ...currentSession(), revokedAt: now }],
  ['absolute limit', { ...currentSession(), absoluteExpiresAt: now }],
  ['another owner', { ...currentSession(), volunteer: { cognitoSub: 'other' } }],
])('returns session-ended for %s standing instead of attempting a foreign-key insert', async (_name, row) => {
  database.lock.mockResolvedValue(row);
  await expect(createSessionHandoff(input, fixedClock(now))).rejects.toMatchObject({
    statusCode: 401,
    code: 'SESSION_EXPIRED',
  });
  expect(database.insert).not.toHaveBeenCalled();
});

it('samples its clock after the session lock wait, refusing a session that expired while waiting', async () => {
  let instant = now;
  database.lock.mockImplementation(async () => {
    instant = new Date(now.getTime() + 120_000);
    return currentSession();
  });
  await expect(createSessionHandoff(input, { now: () => instant })).rejects.toMatchObject({
    code: 'SESSION_EXPIRED',
  });
  expect(database.insert).not.toHaveBeenCalled();
});

it.each([
  ['one-minute maximum', currentSession(), 60_000],
  ['refresh expiry', { ...currentSession(), expiresAt: new Date(now.getTime() + 10_000) }, 10_000],
  ['absolute expiry', { ...currentSession(), absoluteExpiresAt: new Date(now.getTime() + 20_000) }, 20_000],
])('bounds a handoff by the %s', async (_name, row, remaining) => {
  database.lock.mockResolvedValue(row);
  const code = await createSessionHandoff(input, fixedClock(now));
  expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(database.insert).toHaveBeenCalledWith(expect.any(Object), {
    id: code,
    sessionId: input.sessionId,
    challenge: input.challenge,
    expiresAt: new Date(now.getTime() + Number(remaining)),
  });
});
