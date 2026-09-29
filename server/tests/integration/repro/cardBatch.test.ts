import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/app/createApp.js';
import { prisma } from '../../../src/platform/db/client.js';
import { resetDatabase, rawDb } from '../../helpers/db.js';
import { bearer, createVolunteer, testEvent } from '../../helpers/fixtures.js';

/**
 * P03 bug reproduction: a printed card batch that includes a code the
 * database already holds. Codes are random, so the collision is forced by
 * replacing the generator for this file only.
 */

const codes = vi.hoisted(() => ({ next: [] as string[] }));

vi.mock('../../../src/modules/missionCard/domain/shortCode.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../src/modules/missionCard/domain/shortCode.js')>();
  return {
    ...original,
    generateShortCode: () => codes.next.shift() ?? original.generateShortCode(),
  };
});

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe('card batches (P03 repros)', () => {
  // F03-022
  it('never prints a code that belongs to a card already in the system', async () => {
    const admin = await createVolunteer({ email: 'admin@batch.test', role: 'ADMIN' });
    await rawDb.missionCard.create({
      data: {
        eventId: (await testEvent()).eventId,
        shortCode: 'EXIST1',
        qrPayload: 'spoh2027:existing',
        status: 'ISSUED',
        issuedAt: new Date(),
      },
    });
    codes.next = ['EXIST1', 'FRESH1'];

    const response = await request(app)
      .post('/api/v1/cards/batch')
      .set('Authorization', bearer(admin))
      .send({ count: 2, batchLabel: 'repro' });
    expect(response.status).toBe(201);

    const printed = (response.body.csv as string)
      .split('\n')
      .slice(1)
      .map((line) => line.split(',')[0]);
    expect(printed).not.toContain('EXIST1');
    expect(printed).toHaveLength(response.body.created as number);
  });
});

describe('card batch audit (F03-018)', () => {
  it('audits a batch as card.batch, not as an issue', async () => {
    const admin = await createVolunteer({ email: 'admin2@batch.test', role: 'ADMIN' });

    const response = await request(app)
      .post('/api/v1/cards/batch')
      .set('Authorization', bearer(admin))
      .send({ count: 3, batchLabel: 'audited' });
    expect(response.status).toBe(201);

    const entries = await prisma.auditLog.findMany({ where: { entityType: 'MissionCardBatch' } });
    expect(entries.map((entry) => entry.action)).toEqual(['card.batch']);
    expect(entries[0]?.after).toEqual({ requested: 3, created: 3 });
  });
});
