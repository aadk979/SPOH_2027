import { createHash, randomBytes } from 'node:crypto';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import * as handoffRepo from '../../src/modules/auth/data/handoffRepo.js';
import * as sessionIssuer from '../../src/modules/auth/application/issueSession.js';
import { createSessionHandoff } from '../../src/modules/auth/application/createSessionHandoff.js';
import { pruneRefreshSessions } from '../../src/modules/auth/application/pruneSessions.js';
import { identityProvider } from '../../src/platform/identity/index.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createVolunteer, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let person: TestVolunteer;
beforeEach(async () => {
  await resetDatabase();
  person = await createVolunteer({ email: 'handoff-race@example.test', role: 'ADMIN' });
});
afterEach(() => vi.restoreAllMocks());

async function pendingSession() {
  vi.spyOn(identityProvider, 'hasMfa').mockResolvedValue(false);
  const response = await request(app).post('/api/v1/auth/session')
    .send({ providerAccessToken: person.token }).expect(201);
  expect(response.body.mfaRequired).toBe(true);
  const header: unknown = response.headers['set-cookie'];
  const values = Array.isArray(header) ? header as string[] : typeof header === 'string' ? [header] : [];
  const cookie = values.find((value) => value.startsWith('spoh_refresh='))!.split(';')[0]!;
  return { id: decodeJwt(response.body.accessToken as string).sid as string, cookie };
}

function handoffInput(sessionId: string) {
  return { sessionId, sub: person.sub, challenge: randomBytes(32).toString('base64url') };
}

async function waitForSessionLock() {
  await expect.poll(async () => {
    const [row] = await rawDb.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
      AND query LIKE '%RefreshSession%'`;
    return Number(row?.count ?? 0);
  }).toBeGreaterThan(0);
}

it.each(['pruned', 'expired', 'revoked'] as const)(
  'redirects pending MFA recovery to signed-out when its session becomes %s during token issuance',
  async (change) => {
    const opened = await pendingSession();
    const original = sessionIssuer.issueSession;
    vi.spyOn(sessionIssuer, 'issueSession').mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      if (change === 'revoked') {
        await rawDb.refreshSession.update({ where: { id: opened.id }, data: { revokedAt: FROZEN_NOW } });
      } else {
        await rawDb.refreshSession.update({ where: { id: opened.id }, data: { expiresAt: new Date(FROZEN_NOW.getTime() - 1) } });
        if (change === 'pruned') await pruneRefreshSessions(FROZEN_NOW);
      }
      return result;
    });
    const verifier = randomBytes(32).toString('base64url');
    const state = randomBytes(32).toString('base64url');
    const response = await request(app).get('/api/v1/auth/recover').set('Cookie', opened.cookie).query({
      returnTo: 'http://localhost:3000/mfa',
      challenge: createHash('sha256').update(verifier).digest('base64url'),
      state,
    }).expect(302);
    const destination = new URL(response.headers.location as string);
    expect(destination.searchParams.get('auth_state')).toBe(state);
    expect(destination.searchParams.get('auth_status')).toBe('signed-out');
    expect(destination.searchParams.has('auth_code')).toBe(false);
    expect(await rawDb.authHandoff.count()).toBe(0);
  },
);

it.each(['expired', 'revoked', 'deleted'] as const)(
  'sees %s standing committed while waiting for the session lock',
  async (change) => {
    const opened = await pendingSession();
    let instant = FROZEN_NOW;
    let recovery: Promise<{ error?: unknown }> | undefined;
    let outcome: { error?: unknown } | undefined;
    try {
      await rawDb.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "RefreshSession" WHERE id = ${opened.id} FOR UPDATE`;
        recovery = createSessionHandoff(handoffInput(opened.id), { now: () => instant })
          .then(() => ({}), (error: unknown) => ({ error }));
        await waitForSessionLock();
        if (change === 'deleted') await tx.refreshSession.delete({ where: { id: opened.id } });
        else if (change === 'revoked') await tx.refreshSession.update({ where: { id: opened.id }, data: { revokedAt: FROZEN_NOW } });
        else {
          await tx.refreshSession.update({ where: { id: opened.id }, data: { expiresAt: new Date(FROZEN_NOW.getTime() + 1000) } });
          instant = new Date(FROZEN_NOW.getTime() + 1000);
        }
      });
    } finally {
      // A failed lock observation still drains recovery before the next database fixture.
      outcome = await recovery;
    }
    expect(outcome).toMatchObject({ error: { statusCode: 401, code: 'SESSION_EXPIRED' } });
    expect(await rawDb.authHandoff.count()).toBe(0);
  },
);

it('holds pruning behind handoff issuance until its foreign-key insert commits', async () => {
  const opened = await pendingSession();
  await rawDb.refreshSession.update({ where: { id: opened.id }, data: { expiresAt: new Date(FROZEN_NOW.getTime() + 1000) } });
  const original = handoffRepo.insertHandoff;
  let pruning: Promise<{ removed: number } | { error: unknown }> | undefined;
  let outcome: Awaited<typeof pruning>;
  vi.spyOn(handoffRepo, 'insertHandoff').mockImplementationOnce(async (...args) => {
    // Catch immediately: a worker failure must not become an unhandled pending rejection.
    pruning = pruneRefreshSessions(new Date(FROZEN_NOW.getTime() + 1001))
      .then((removed) => ({ removed }), (error: unknown) => ({ error }));
    await waitForSessionLock();
    expect(await rawDb.refreshSession.findUnique({ where: { id: opened.id } })).not.toBeNull();
    return original(...args);
  });
  try {
    expect(await createSessionHandoff(handoffInput(opened.id), fixedClock(FROZEN_NOW)))
      .toMatch(/^[A-Za-z0-9_-]{43}$/);
  } finally {
    outcome = await pruning;
  }
  expect(outcome).toEqual({ removed: 1 });
  expect(await rawDb.refreshSession.findUnique({ where: { id: opened.id } })).toBeNull();
  expect(await rawDb.authHandoff.count()).toBe(0);
});
