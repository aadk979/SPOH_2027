import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import { resetDatabase } from '../../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
} from '../../helpers/fixtures.js';

/**
 * P04 security reproductions. The skipped tests assert the correct behaviour
 * and fail today; the others guard ownership checks that hold today, so a
 * refactor cannot quietly remove them (P04.3 IDOR table in F04).
 */

let app: Express;
let stationA: string;
let stationB: string;
let volunteerA: TestVolunteer;
let volunteerB: TestVolunteer;
let icA: TestVolunteer;
let icB: TestVolunteer;
let chief: TestVolunteer;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  const eventDayId = (await createEventDayToday()).id;
  stationA = (await createStation({ code: 'A', name: 'Station A' })).id;
  stationB = (await createStation({ code: 'B', name: 'Station B' })).id;

  volunteerA = await createVolunteer({ email: 'va@p04.test', role: 'VOLUNTEER' });
  volunteerB = await createVolunteer({ email: 'vb@p04.test', role: 'VOLUNTEER' });
  icA = await createVolunteer({ email: 'ica@p04.test', role: 'IC' });
  icB = await createVolunteer({ email: 'icb@p04.test', role: 'IC' });
  chief = await createVolunteer({ email: 'chief@p04.test', role: 'CHIEF_COORDINATOR' });

  for (const [who, stationId] of [
    [volunteerA, stationA],
    [icA, stationA],
    [volunteerB, stationB],
    [icB, stationB],
  ] as const) {
    await assignToStationAllBlocks({ volunteerId: who.id, stationId, eventDayId });
  }
  await prisma.volunteer.update({ where: { id: volunteerB.id }, data: { phone: '+65 9000 0000' } });
});

describe('rate limits (P04.4)', () => {
  // F04-006
  it.skip('lets a morning rush of volunteers sign in from one campus address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      const person = await createVolunteer({ email: `rush${i}@p04.test`, role: 'VOLUNTEER' });
      const response = await request(app)
        .post('/api/v1/auth/session')
        .send({ email: person.email });
      statuses.push(response.status);
    }

    // Thirty different people behind one NAT egress: none of them is an
    // attacker. Every request here comes from the same test client address.
    expect(statuses.filter((status) => status === 429)).toHaveLength(0);
  });
});

describe('access by id across stations (P04.3)', () => {
  // F04-004
  it.skip("does not give an IC another station's roster phone numbers", async () => {
    const response = await request(app)
      .get(`/api/v1/roster/station/${stationB}`)
      .set('Authorization', bearer(icA));

    expect(JSON.stringify(response.body)).not.toContain('+65 9000 0000');
  });

  // F04-005
  it.skip('does not reveal an announcement addressed to another station', async () => {
    const sent = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', bearer(icB))
      .send({ body: 'Station B only: hold the queue.', target: { stationId: stationB } });
    expect(sent.status).toBe(201);

    const response = await request(app)
      .post(`/api/v1/announcements/${sent.body.announcement.id}/ack`)
      .set('Authorization', bearer(volunteerA));

    expect(response.status).toBe(404);
  });

  // F04-005
  it.skip('does not reveal an announcement addressed to another role', async () => {
    const sent = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', bearer(chief))
      .send({ body: 'ICs only: incident debrief at 5pm.', target: { role: 'IC' } });
    expect(sent.status).toBe(201);

    const response = await request(app)
      .post(`/api/v1/announcements/${sent.body.announcement.id}/ack`)
      .set('Authorization', bearer(volunteerA));

    expect(response.status).toBe(404);
  });

  // F04-024
  it.skip('lets an IC address only the station they run', async () => {
    const response = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', bearer(icA))
      .send({ body: 'Close the booth now.', priority: 'URGENT', target: { stationId: stationB } });

    expect(response.status).toBe(403);
  });

  it('refuses to check a volunteer into somebody else’s shift', async () => {
    const theirs = await prisma.shiftAssignment.findFirstOrThrow({
      where: { volunteerId: volunteerB.id },
    });
    const response = await request(app)
      .post('/api/v1/me/check-in')
      .set('Authorization', bearer(volunteerA))
      .send({ assignmentId: theirs.id });

    expect(response.status).toBe(403);
  });

  it('refuses a swap request for somebody else’s shift', async () => {
    const theirs = await prisma.shiftAssignment.findFirstOrThrow({
      where: { volunteerId: volunteerB.id },
    });
    const response = await request(app)
      .post('/api/v1/roster/swaps')
      .set('Authorization', bearer(volunteerA))
      .send({ assignmentId: theirs.id, targetVolunteerId: icA.id, reason: 'Not mine to give' });

    expect(response.status).toBe(403);
  });

  it('refuses to sign out somebody else’s device', async () => {
    // Opens a session through the sign-in route, so it shares the per-IP
    // sensitive limit with any other sign-in in this file.
    const opened = await request(app)
      .post('/api/v1/auth/session')
      .send({ email: volunteerB.email });
    expect(opened.status).toBe(201);
    const session = await prisma.refreshSession.findFirstOrThrow({
      where: { volunteerId: volunteerB.id },
    });

    const response = await request(app)
      .delete(`/api/v1/auth/sessions/${session.id}`)
      .set('Authorization', bearer(volunteerA));

    expect(response.status).toBe(404);
    const after = await prisma.refreshSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(after.revokedAt).toBeNull();
  });

  it('refuses a capture at a station the volunteer is not rostered on', async () => {
    const response = await request(app)
      .post('/api/v1/footfall/ticks')
      .set('Authorization', bearer(volunteerA))
      .send({ stationId: stationB, idempotencyKey: idempotencyKey() });

    expect(response.status).toBe(403);
  });
});
