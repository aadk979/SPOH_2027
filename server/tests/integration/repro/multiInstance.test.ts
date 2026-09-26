import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../../src/platform/db/client.js';
import { resetDatabase } from '../../helpers/db.js';
import { bearer, createVolunteer, type TestVolunteer } from '../../helpers/fixtures.js';

/**
 * P03.5 — two server instances against one database.
 *
 * Production runs several workers (the audit branch's PM2 `instances: 'max'`;
 * P08 runs several containers). Each worker has its own module state: the
 * volunteer and session caches, the rate-limit counters, the settings cache
 * and the scheduled jobs. Loading the app twice with `vi.resetModules()` gives
 * two copies of every module, which is exactly that, with one database behind
 * them. Each test asserts what a multi-worker deployment needs and fails today.
 */

interface Instance {
  app: Express;
  purgeResolvedAlerts: () => Promise<number>;
  disconnect: () => Promise<void>;
}

async function startInstance(): Promise<Instance> {
  vi.resetModules();
  const { createApp } = await import('../../../src/app.js');
  const { purgeResolvedAlerts } = await import('../../../src/modules/lostPerson/service.js');
  const { disconnectPrisma } = await import('../../../src/platform/db/client.js');
  return { app: createApp(), purgeResolvedAlerts, disconnect: disconnectPrisma };
}

let a: Instance;
let b: Instance;
let chief: TestVolunteer;
let volunteer: TestVolunteer;

beforeAll(async () => {
  a = await startInstance();
  b = await startInstance();
});

afterAll(async () => {
  await a.disconnect();
  await b.disconnect();
});

beforeEach(async () => {
  await resetDatabase();
  chief = await createVolunteer({ email: 'chief@multi.test', role: 'CHIEF_COORDINATOR' });
  volunteer = await createVolunteer({ email: 'v@multi.test', role: 'VOLUNTEER' });
});

describe('two instances, one database (P03.5 repros)', () => {
  // PF-01
  it.skip('stops a deactivated volunteer on every instance at once', async () => {
    const me = (instance: Instance) =>
      request(instance.app).get('/api/v1/me').set('Authorization', bearer(volunteer));

    // The volunteer is working through instance B, so B has them cached.
    expect((await me(b)).status).toBe(200);

    const deactivate = await request(a.app)
      .post(`/api/v1/admin/volunteers/${volunteer.id}/deactivate`)
      .set('Authorization', bearer(chief))
      .send({ reason: 'Left the committee', disableIdentity: false });
    expect(deactivate.status).toBe(200);

    expect((await me(a)).status).not.toBe(200);
    expect((await me(b)).status).not.toBe(200);
  });

  // PF-02
  it.skip('applies the sign-in limit across instances, not per instance', async () => {
    const attempt = (instance: Instance) =>
      request(instance.app).post('/api/v1/auth/session').send({ email: 'nobody@multi.test' });

    // RATE_LIMIT_MAX_SENSITIVE is 20 per window from one address.
    for (let i = 0; i < 20; i += 1) expect((await attempt(a)).status).toBe(404);
    expect((await attempt(a)).status).toBe(429);

    expect((await attempt(b)).status).toBe(429);
  });

  // F03-030
  it.skip('shows a settings change on the other instance straight away', async () => {
    const patch = await request(a.app)
      .patch('/api/v1/admin/settings')
      .set('Authorization', bearer(chief))
      .send({ eventName: 'Dry Run 2' });
    expect(patch.status).toBe(200);

    const read = await request(b.app)
      .get('/api/v1/admin/settings')
      .set('Authorization', bearer(chief));
    expect(read.body.settings.eventName).toBe('Dry Run 2');
  });

  // F03-031
  it.skip('purges each resolved lost-person alert once when every worker runs the job', async () => {
    const resolvedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    for (let i = 0; i < 5; i += 1) {
      await prisma.lostPersonAlert.create({
        data: {
          descriptionText: `Child ${i}, blue shirt`,
          raisedById: volunteer.id,
          raisedAt: new Date(resolvedAt.getTime() - 20 * 60_000),
          status: 'RESOLVED_FOUND',
          resolvedAt,
        },
      });
    }

    await Promise.all([a.purgeResolvedAlerts(), b.purgeResolvedAlerts()]);

    expect(await prisma.lostPersonSummary.count()).toBe(5);
  });
});
