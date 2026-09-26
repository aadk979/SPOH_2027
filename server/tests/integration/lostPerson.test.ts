import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/platform/db/client.js';
import { PURGE_AFTER_HOURS, purgeResolvedAlerts } from '../../src/modules/lostPerson/service.js';
import { resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * Lost person: raise, broadcast, acknowledge, resolve, purge.
 *
 * The purge test is BUILD_PLAN §10 case 7 and it is the one that matters most
 * here — it is the difference between "we promise the description is transient"
 * and "the description is transient".
 */

let app: Express;
let finder: TestVolunteer;
let searcher: TestVolunteer;
let ic: TestVolunteer;
let stationId: string;

const DESCRIPTION = 'Child separated from their group near the lounge.';

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  await createEventDayToday();

  stationId = (await createStation({ code: 'LOUNGE', name: 'Welcome Lounge' })).id;

  finder = await createVolunteer({ email: 'finder@lost.test', role: 'VOLUNTEER' });
  searcher = await createVolunteer({ email: 'searcher@lost.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@lost.test', role: 'IC' });
});

async function raise(actor: TestVolunteer = finder): Promise<request.Response> {
  return request(app).post('/api/v1/lost-person').set('Authorization', bearer(actor)).send({
    descriptionText: DESCRIPTION,
    approxAge: 'about 8',
    clothingText: 'red jacket',
    lastSeenStationId: stationId,
    idempotencyKey: idempotencyKey(),
  });
}

describe('raising an alert', () => {
  it('is available to any role, because whoever sees it raises it', async () => {
    const response = await raise();

    expect(response.status).toBe(201);
    expect(response.body.alert.status).toBe('ACTIVE');
    expect(response.body.alert.lastSeenStationName).toBe('Welcome Lounge');
  });

  it('reaches every other device on the next poll', async () => {
    await raise();

    const poll = await request(app)
      .get('/api/v1/lost-person/active')
      .set('Authorization', bearer(searcher));

    expect(poll.body.alerts).toHaveLength(1);
    expect(poll.body.alerts[0].descriptionText).toBe(DESCRIPTION);
    expect(poll.body.alerts[0].ackedByMe).toBe(false);
  });

  it('carries the reporter phone number, because calling beats tapping', async () => {
    await prisma.volunteer.update({
      where: { id: finder.id },
      data: { phone: '+65 9123 4567' },
    });

    const response = await raise();
    expect(response.body.alert.raisedByPhone).toBe('+65 9123 4567');
  });

  it('keeps the description out of the audit log', async () => {
    await raise();

    const audit = await prisma.auditLog.findFirst({ where: { action: 'lostPerson.raise' } });
    expect(audit).not.toBeNull();
    // The alert's own fields are purged on resolution. Copying them into an
    // audit row that is never purged would quietly defeat that guarantee.
    expect(JSON.stringify(audit?.after)).not.toContain('red jacket');
    expect(JSON.stringify(audit?.after)).not.toContain(DESCRIPTION);
  });
});

describe('acknowledgement', () => {
  it('counts each volunteer once however many times they tap', async () => {
    const alertId = (await raise()).body.alert.id;

    await request(app)
      .post(`/api/v1/lost-person/${alertId}/ack`)
      .set('Authorization', bearer(searcher));

    const second = await request(app)
      .post(`/api/v1/lost-person/${alertId}/ack`)
      .set('Authorization', bearer(searcher));

    expect(second.body.alert.ackCount).toBe(1);
    expect(second.body.alert.ackedByMe).toBe(true);
  });

  it('accumulates acknowledgements across devices', async () => {
    const alertId = (await raise()).body.alert.id;

    await request(app)
      .post(`/api/v1/lost-person/${alertId}/ack`)
      .set('Authorization', bearer(searcher));

    const byIc = await request(app)
      .post(`/api/v1/lost-person/${alertId}/ack`)
      .set('Authorization', bearer(ic));

    // This count is what tells the Safety IC how much of the floor has been
    // reached, rather than assuming a broadcast was read.
    expect(byIc.body.alert.ackCount).toBe(2);
  });
});

describe('resolution', () => {
  it('denies a volunteer resolving an alert', async () => {
    const alertId = (await raise()).body.alert.id;

    const response = await request(app)
      .post(`/api/v1/lost-person/${alertId}/resolve`)
      .set('Authorization', bearer(finder))
      .send({ outcome: 'RESOLVED_FOUND' });

    expect(response.status).toBe(403);
  });

  it('clears the alert from every device', async () => {
    const alertId = (await raise()).body.alert.id;

    await request(app)
      .post(`/api/v1/lost-person/${alertId}/resolve`)
      .set('Authorization', bearer(ic))
      .send({ outcome: 'RESOLVED_FOUND', note: 'Reunited at the lounge' });

    const poll = await request(app)
      .get('/api/v1/lost-person/active')
      .set('Authorization', bearer(searcher));

    expect(poll.body.alerts).toHaveLength(0);
  });

  it('refuses to resolve the same alert twice', async () => {
    const alertId = (await raise()).body.alert.id;

    await request(app)
      .post(`/api/v1/lost-person/${alertId}/resolve`)
      .set('Authorization', bearer(ic))
      .send({ outcome: 'RESOLVED_FOUND' });

    const second = await request(app)
      .post(`/api/v1/lost-person/${alertId}/resolve`)
      .set('Authorization', bearer(ic))
      .send({ outcome: 'RESOLVED_FOUND' });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALERT_ALREADY_RESOLVED');
  });
});

/** BUILD_PLAN §10 case 7 — the guarantee that makes the exception acceptable. */
describe('the purge', () => {
  it('leaves an alert alone until the retention window has passed', async () => {
    const alertId = (await raise()).body.alert.id;
    await request(app)
      .post(`/api/v1/lost-person/${alertId}/resolve`)
      .set('Authorization', bearer(ic))
      .send({ outcome: 'RESOLVED_FOUND' });

    expect(await purgeResolvedAlerts()).toBe(0);

    const alert = await prisma.lostPersonAlert.findUnique({ where: { id: alertId } });
    expect(alert?.descriptionText).toBe(DESCRIPTION);
  });

  it('nulls the descriptive fields and writes an anonymised summary', async () => {
    const alertId = (await raise()).body.alert.id;

    await request(app)
      .post(`/api/v1/lost-person/${alertId}/ack`)
      .set('Authorization', bearer(searcher));

    await request(app)
      .post(`/api/v1/lost-person/${alertId}/resolve`)
      .set('Authorization', bearer(ic))
      .send({ outcome: 'RESOLVED_FOUND' });

    // Backdate past the retention window rather than waiting 24 hours.
    const raisedAt = new Date(Date.now() - (PURGE_AFTER_HOURS + 2) * 60 * 60 * 1000);
    const resolvedAt = new Date(raisedAt.getTime() + 7 * 60 * 1000);
    await prisma.lostPersonAlert.update({
      where: { id: alertId },
      data: { raisedAt, resolvedAt },
    });

    expect(await purgeResolvedAlerts()).toBe(1);

    const alert = await prisma.lostPersonAlert.findUnique({ where: { id: alertId } });
    expect(alert?.approxAge).toBeNull();
    expect(alert?.descriptionText).toBeNull();
    expect(alert?.clothingText).toBeNull();
    expect(alert?.purgedAt).not.toBeNull();

    // What survives is what goes in the post-event report: "1 case, resolved,
    // 7 minutes" — never a description of a child.
    const summaries = await prisma.lostPersonSummary.findMany();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.resolutionMinutes).toBe(7);
    expect(summaries[0]?.outcome).toBe('RESOLVED_FOUND');
    expect(summaries[0]?.ackCount).toBe(1);
    expect(JSON.stringify(summaries[0])).not.toContain('red jacket');
  });

  it('is idempotent — a second run purges nothing', async () => {
    const alertId = (await raise()).body.alert.id;
    await request(app)
      .post(`/api/v1/lost-person/${alertId}/resolve`)
      .set('Authorization', bearer(ic))
      .send({ outcome: 'RESOLVED_OTHER' });

    await prisma.lostPersonAlert.update({
      where: { id: alertId },
      data: { resolvedAt: new Date(Date.now() - (PURGE_AFTER_HOURS + 1) * 60 * 60 * 1000) },
    });

    expect(await purgeResolvedAlerts()).toBe(1);
    expect(await purgeResolvedAlerts()).toBe(0);
    expect(await prisma.lostPersonSummary.count()).toBe(1);
  });

  it('never touches an active alert', async () => {
    const alertId = (await raise()).body.alert.id;

    // Even an old unresolved alert stays intact: a search still in progress is
    // exactly when the description is needed.
    await prisma.lostPersonAlert.update({
      where: { id: alertId },
      data: { raisedAt: new Date(Date.now() - 72 * 60 * 60 * 1000) },
    });

    expect(await purgeResolvedAlerts()).toBe(0);

    const alert = await prisma.lostPersonAlert.findUnique({ where: { id: alertId } });
    expect(alert?.descriptionText).toBe(DESCRIPTION);
  });
});
