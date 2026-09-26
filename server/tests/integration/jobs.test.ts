import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { pruneIdempotencyRecords } from '../../src/middleware/idempotency.js';
import { pruneRefreshSessions } from '../../src/modules/auth/service.js';
import { resetDatabase } from '../helpers/db.js';
import { createVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/**
 * The scheduled prunes (P06.1, P03.6 rank 9). Both delete rows and neither had
 * a test; the purge is tested in lostPerson.test.ts. The scheduler that runs
 * them on an interval is `jobs/scheduler.ts`, replaced in P10.
 */

const DAY = 86_400_000;

beforeEach(async () => {
  await resetDatabase();
});

describe('pruneIdempotencyRecords', () => {
  it('deletes records older than the retention period and keeps the rest', async () => {
    const at = (daysAgo: number): Date => new Date(FROZEN_NOW.getTime() - daysAgo * DAY);
    for (const [key, daysAgo] of [
      ['old', 8],
      ['recent', 6],
    ] as const) {
      await prisma.idempotencyRecord.create({
        data: {
          key,
          endpoint: 'POST /registrations',
          actorSub: 'sub',
          statusCode: 201,
          responseBody: {},
          createdAt: at(daysAgo),
        },
      });
    }

    expect(await pruneIdempotencyRecords(FROZEN_NOW)).toBe(1);
    const left = await prisma.idempotencyRecord.findMany({ select: { key: true } });
    expect(left).toEqual([{ key: 'recent' }]);
  });
});

describe('pruneRefreshSessions', () => {
  it('deletes expired sessions and ones revoked over a week ago', async () => {
    const volunteer = await createVolunteer({ email: 'prune@jobs.test', role: 'VOLUNTEER' });
    const session = (tokenHash: string, fields: { expiresAt: Date; revokedAt?: Date }) =>
      prisma.refreshSession.create({
        data: { volunteerId: volunteer.id, tokenHash, familyId: 'family', ...fields },
      });
    const later = new Date(FROZEN_NOW.getTime() + DAY);

    await session('expired', { expiresAt: new Date(FROZEN_NOW.getTime() - 1000) });
    await session('revoked-long-ago', {
      expiresAt: later,
      revokedAt: new Date(FROZEN_NOW.getTime() - 8 * DAY),
    });
    await session('revoked-recently', {
      expiresAt: later,
      revokedAt: new Date(FROZEN_NOW.getTime() - DAY),
    });
    await session('live', { expiresAt: later });

    expect(await pruneRefreshSessions(FROZEN_NOW)).toBe(2);
    const left = await prisma.refreshSession.findMany({
      select: { tokenHash: true },
      orderBy: { tokenHash: 'asc' },
    });
    expect(left.map((row) => row.tokenHash)).toEqual(['live', 'revoked-recently']);
  });
});
