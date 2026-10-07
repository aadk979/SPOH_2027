import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabase, rawDb } from '../../helpers/db.js';
import { bearer, createVolunteer, type TestVolunteer, testEvent } from '../../helpers/fixtures.js';

/**
 * P03.5 — two server instances against one database.
 *
 * Production runs several workers (the audit branch's PM2 `instances: 'max'`;
 * P08 runs several containers). Each worker has its own module state: the
 * volunteer and session caches, the rate-limit counters, the settings cache
 * and the scheduled jobs. Loading the app twice with `vi.resetModules()` gives
 * two copies of every module, which is exactly that, with one database behind
 * them. Each test asserts what a multi-worker deployment needs.
 */

interface Instance {
  app: Express;
  purgeResolvedAlerts: () => Promise<number>;
  disconnect: () => Promise<void>;
  clearCaches: () => Promise<void>;
  /** The legacy store's own writer; no endpoint writes it any more. */
  writeLegacySetting: (patch: { eventName: string }) => Promise<unknown>;
  busStatus: () => 'unstarted' | 'connected' | 'degraded';
  busGauge: () => number;
}

async function startInstance(): Promise<Instance> {
  vi.resetModules();
  const { createApp } = await import('../../../src/app/createApp.js');
  const { purgeResolvedAlerts } = await import('../../../src/modules/lostPerson/index.js');
  const { disconnectPrisma } = await import('../../../src/platform/db/client.js');
  const { startCacheBus, stopCacheBus, cacheBusStatus } =
    await import('../../../src/platform/events/cacheBus.js');
  const { recordCacheBusMetrics } = await import('../../../src/platform/events/cacheBusMetrics.js');
  const busGauge = () => {
    let value = -1;
    recordCacheBusMetrics({
      info: (fields) => {
        value = fields.cacheBusDegraded;
      },
    });
    return value;
  };
  const { invalidateVolunteerCache } = await import('../../../src/platform/identity/index.js');
  const { invalidateEventCache } = await import('../../../src/platform/event/events.js');
  const { loadSettings, updateSettings } = await import('../../../src/platform/settings/index.js');
  const { SYSTEM_AUDIT_CONTEXT } = await import('../../../src/platform/http/auditContext.js');
  expect(busGauge()).toBe(1);
  await startCacheBus();
  return {
    app: createApp(),
    purgeResolvedAlerts,
    busStatus: cacheBusStatus,
    busGauge,
    writeLegacySetting: (patch) => updateSettings(patch, null, SYSTEM_AUDIT_CONTEXT),
    clearCaches: async () => {
      invalidateVolunteerCache();
      invalidateEventCache();
      await loadSettings();
    },
    disconnect: async () => {
      await stopCacheBus();
      await disconnectPrisma();
    },
  };
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
  await a.clearCaches();
  await b.clearCaches();
  chief = await createVolunteer({ email: 'chief@multi.test', role: 'CHIEF_COORDINATOR' });
  volunteer = await createVolunteer({ email: 'v@multi.test', role: 'VOLUNTEER' });
});

describe('two instances, one database (P03.5 repros)', () => {
  // PF-01
  it('stops a deactivated volunteer on every instance within two seconds', async () => {
    const me = (instance: Instance) =>
      request(instance.app).get('/api/v1/me').set('Authorization', bearer(volunteer));

    // The volunteer is working through instance B, so B has them cached.
    expect((await me(b)).status).toBe(200);

    const deactivate = await request(a.app)
      .post(`/api/v1/admin/volunteers/${volunteer.id}/deactivate`)
      .set('Authorization', bearer(chief))
      .send({ reason: 'Left the committee', disableIdentity: false });
    expect(deactivate.status).toBe(200);

    await expect
      .poll(async () => (await me(a)).status, { timeout: 2_000, interval: 50 })
      .not.toBe(200);
    await expect
      .poll(async () => (await me(b)).status, { timeout: 2_000, interval: 50 })
      .not.toBe(200);
  });

  it('applies a role demotion on the other instance within two seconds', async () => {
    const admin = await createVolunteer({ email: 'admin@multi.test', role: 'ADMIN' });
    const roster = () =>
      request(b.app).get('/api/v1/admin/volunteers').set('Authorization', bearer(chief));
    const warm = await roster();
    expect(warm.status, JSON.stringify(warm.body)).toBe(200);
    await request(a.app)
      .patch(`/api/v1/admin/volunteers/${chief.id}`)
      .set('Authorization', bearer(admin))
      .send({ role: 'VOLUNTEER' })
      .expect(200);
    await expect
      .poll(async () => (await roster()).status, { timeout: 2_000, interval: 50 })
      .toBe(403);
  });

  it('revokes an access token already cached on the other instance', async () => {
    const signIn = async (): Promise<string> => {
      const response = await request(a.app)
        .post('/api/v1/auth/session')
        .send({ email: volunteer.email });
      expect(response.status).toBe(201);
      return response.body.accessToken as string;
    };
    const phone = await signIn();
    const laptop = await signIn();
    const me = () => request(b.app).get('/api/v1/me').set('Authorization', `Bearer ${phone}`);
    expect((await me()).status).toBe(200);
    const sessions = await request(a.app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${laptop}`);
    const phoneSession = (sessions.body.data as Array<{ id: string; current: boolean }>).find(
      (session) => !session.current,
    );
    expect(phoneSession).toBeDefined();
    await request(a.app)
      .delete(`/api/v1/auth/sessions/${phoneSession?.id ?? ''}`)
      .set('Authorization', `Bearer ${laptop}`)
      .expect(204);
    await expect.poll(async () => (await me()).status, { timeout: 2_000, interval: 50 }).toBe(401);
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
  it('shows a settings change on the other instance within two seconds', async () => {
    await a.writeLegacySetting({ eventName: 'Dry Run 2' });

    await expect
      .poll(
        async () => {
          const read = await request(b.app)
            .get('/api/v1/admin/settings')
            .set('Authorization', bearer(chief));
          return read.body.settings.eventName;
        },
        { timeout: 2_000, interval: 50 },
      )
      .toBe('Dry Run 2');
  });

  it('bypasses identity caches while disconnected and refreshes after reconnecting', async () => {
    expect(a.busGauge()).toBe(0);
    expect(b.busGauge()).toBe(0);
    const { eventId } = await testEvent();
    const me = () => request(b.app).get('/api/v1/me').set('Authorization', bearer(volunteer));
    const settings = () =>
      request(b.app).get('/api/v1/admin/settings').set('Authorization', bearer(chief));
    expect((await me()).status).toBe(200);
    expect((await settings()).body.settings.eventName).toBe('Event');
    await rawDb.appSetting.create({ data: { key: 'eventName', value: 'Recovered event' } });

    await rawDb.$executeRaw`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname = current_database() AND application_name = 'spoh-cache-bus'
        AND pid <> pg_backend_pid()
    `;
    await expect.poll(b.busStatus, { timeout: 2_000, interval: 50 }).toBe('degraded');
    expect(b.busGauge()).toBe(1);
    await rawDb.eventMembership.updateMany({
      where: { eventId, personId: volunteer.id },
      data: { status: 'DEACTIVATED' },
    });
    expect((await me()).status).toBe(403);
    await rawDb.eventMembership.updateMany({
      where: { eventId, personId: volunteer.id },
      data: { status: 'ACTIVE' },
    });
    await expect.poll(b.busStatus, { timeout: 5_000, interval: 50 }).toBe('connected');
    expect(b.busGauge()).toBe(0);
    await expect
      .poll(async () => (await settings()).body.settings.eventName, {
        timeout: 2_000,
        interval: 50,
      })
      .toBe('Recovered event');
    expect((await me()).status).toBe(200);
  });

  // F03-031
  it('purges each resolved lost-person alert once when every worker runs the job', async () => {
    const resolvedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
    for (let i = 0; i < 5; i += 1) {
      await rawDb.lostPersonAlert.create({
        data: {
          eventId: (await testEvent()).eventId,
          descriptionText: `Child ${i}, blue shirt`,
          raisedById: volunteer.id,
          raisedAt: new Date(resolvedAt.getTime() - 20 * 60_000),
          status: 'RESOLVED_FOUND',
          resolvedAt,
        },
      });
    }

    await Promise.all([a.purgeResolvedAlerts(), b.purgeResolvedAlerts()]);

    expect(await rawDb.lostPersonSummary.count()).toBe(5);
  });
});
