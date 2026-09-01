import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * Announcements and shift swaps.
 *
 * Targeting is the thing worth testing: an announcement that reaches everybody
 * is a push nobody reads, and one that reaches nobody is worse than not sending
 * it at all.
 */

let app: Express;
let boothVolunteer: TestVolunteer;
let roomVolunteer: TestVolunteer;
let spare: TestVolunteer;
let ic: TestVolunteer;
let chief: TestVolunteer;
let boothStationId: string;
let roomId: string;
let eventDayId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();

  const eventDay = await createEventDayToday();
  eventDayId = eventDay.id;

  boothStationId = (await createStation({ code: 'BOOTH', name: 'Sign-Up Booth' })).id;
  roomId = (await createStation({ code: 'ROOM', name: 'Room A', countsEntry: true })).id;

  boothVolunteer = await createVolunteer({ email: 'booth@comms.test', role: 'VOLUNTEER' });
  roomVolunteer = await createVolunteer({ email: 'room@comms.test', role: 'VOLUNTEER' });
  spare = await createVolunteer({ email: 'spare@comms.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@comms.test', role: 'IC' });
  chief = await createVolunteer({ email: 'chief@comms.test', role: 'CHIEF_COORDINATOR' });

  await assignToStationAllBlocks({
    volunteerId: boothVolunteer.id,
    stationId: boothStationId,
    eventDayId,
  });
  await assignToStationAllBlocks({ volunteerId: roomVolunteer.id, stationId: roomId, eventDayId });
  await assignToStationAllBlocks({
    volunteerId: ic.id,
    stationId: boothStationId,
    eventDayId,
  });
});

function send(actor: TestVolunteer, body: Record<string, unknown>): request.Test {
  return request(app).post('/api/v1/announcements').set('Authorization', bearer(actor)).send(body);
}

async function inbox(actor: TestVolunteer): Promise<request.Response> {
  return request(app).get('/api/v1/announcements').set('Authorization', bearer(actor));
}

describe('who may send what', () => {
  it('lets an IC address their own station', async () => {
    const response = await send(ic, {
      body: 'DCDF at capacity, ushers hold at Welcome Lounge.',
      target: { stationId: boothStationId },
    });

    expect(response.status).toBe(201);
  });

  it('denies an IC an event-wide announcement', async () => {
    // The distinction lives in the payload, not the path, so the check has to
    // be in the service where the target is visible.
    const response = await send(ic, { body: 'Everyone please gather.', target: {} });

    expect(response.status).toBe(403);
    expect(response.body.error.message).toContain('event-wide');
  });

  it('lets the Chief address the whole event', async () => {
    const response = await send(chief, { body: 'Doors open in ten minutes.', target: {} });
    expect(response.status).toBe(201);
  });

  it('denies a volunteer sending anything', async () => {
    const response = await send(boothVolunteer, { body: 'Hello everyone', target: {} });
    expect(response.status).toBe(403);
  });
});

describe('targeting', () => {
  it('reaches only the station it was addressed to', async () => {
    await send(ic, { body: 'Booth only, please hold.', target: { stationId: boothStationId } });

    const atBooth = await inbox(boothVolunteer);
    const inRoom = await inbox(roomVolunteer);

    expect(atBooth.body.data).toHaveLength(1);
    expect(inRoom.body.data).toHaveLength(0);
  });

  it('reaches everyone when no target is set', async () => {
    await send(chief, { body: 'Event-wide notice.', target: {} });

    expect((await inbox(boothVolunteer)).body.data).toHaveLength(1);
    expect((await inbox(roomVolunteer)).body.data).toHaveLength(1);
    // Including someone not rostered anywhere today.
    expect((await inbox(spare)).body.data).toHaveLength(1);
  });

  it('reaches only the role it was addressed to', async () => {
    await send(chief, { body: 'ICs, gather at the desk.', target: { role: 'IC' } });

    expect((await inbox(ic)).body.data).toHaveLength(1);
    expect((await inbox(boothVolunteer)).body.data).toHaveLength(0);
  });

  it('reports how many people a message was addressed to', async () => {
    const response = await send(ic, {
      body: 'Booth team, break rotation starts now.',
      target: { stationId: boothStationId },
    });

    // Two people are rostered at the booth today.
    expect(response.body.announcement.audienceCount).toBe(2);
  });

  it('hides an expired announcement', async () => {
    await send(chief, {
      body: 'This has already passed.',
      target: {},
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    expect((await inbox(boothVolunteer)).body.data).toHaveLength(0);
  });
});

describe('acknowledgement', () => {
  it('tracks reach without double counting a repeated tap', async () => {
    const created = await send(chief, {
      body: 'Confirm you have read this.',
      target: {},
      requiresAck: true,
    });

    const id = created.body.announcement.id as string;

    await request(app)
      .post(`/api/v1/announcements/${id}/ack`)
      .set('Authorization', bearer(boothVolunteer));

    const second = await request(app)
      .post(`/api/v1/announcements/${id}/ack`)
      .set('Authorization', bearer(boothVolunteer));

    expect(second.body.announcement.ackCount).toBe(1);
    expect(second.body.announcement.ackedByMe).toBe(true);
  });

  it('filters the inbox to what still needs acknowledging', async () => {
    const needsAck = await send(chief, {
      body: 'Please confirm.',
      target: {},
      requiresAck: true,
    });
    await send(chief, { body: 'Just so you know.', target: {} });

    const before = await request(app)
      .get('/api/v1/announcements?unackedOnly=true')
      .set('Authorization', bearer(boothVolunteer));
    expect(before.body.data).toHaveLength(1);

    await request(app)
      .post(`/api/v1/announcements/${needsAck.body.announcement.id}/ack`)
      .set('Authorization', bearer(boothVolunteer));

    const after = await request(app)
      .get('/api/v1/announcements?unackedOnly=true')
      .set('Authorization', bearer(boothVolunteer));
    expect(after.body.data).toHaveLength(0);
  });
});

describe('shift swaps', () => {
  async function myAssignment(actor: TestVolunteer): Promise<string> {
    const assignment = await prisma.shiftAssignment.findFirst({
      where: { volunteerId: actor.id },
      select: { id: true },
    });
    return assignment?.id ?? '';
  }

  it('lets a volunteer give away their own shift', async () => {
    const response = await request(app)
      .post('/api/v1/roster/swaps')
      .set('Authorization', bearer(boothVolunteer))
      .send({
        assignmentId: await myAssignment(boothVolunteer),
        targetVolunteerId: spare.id,
        reason: 'Family commitment that morning',
      });

    expect(response.status).toBe(201);
    expect(response.body.swap.status).toBe('REQUESTED');
  });

  it('refuses to let anyone give away somebody else shift', async () => {
    const response = await request(app)
      .post('/api/v1/roster/swaps')
      .set('Authorization', bearer(roomVolunteer))
      .send({
        assignmentId: await myAssignment(boothVolunteer),
        targetVolunteerId: spare.id,
      });

    // Otherwise any volunteer could reassign any other volunteer.
    expect(response.status).toBe(403);
  });

  it('refuses a target who is already working that block', async () => {
    const response = await request(app)
      .post('/api/v1/roster/swaps')
      .set('Authorization', bearer(boothVolunteer))
      .send({
        assignmentId: await myAssignment(boothVolunteer),
        targetVolunteerId: roomVolunteer.id,
      });

    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain('already working');
  });

  it('moves the assignment on approval and clears the check-in', async () => {
    const assignmentId = await myAssignment(boothVolunteer);
    await prisma.shiftAssignment.update({
      where: { id: assignmentId },
      data: { checkedInAt: new Date() },
    });

    const swap = await request(app)
      .post('/api/v1/roster/swaps')
      .set('Authorization', bearer(boothVolunteer))
      .send({ assignmentId, targetVolunteerId: spare.id });

    const decided = await request(app)
      .post(`/api/v1/roster/swaps/${swap.body.swap.id}/decide`)
      .set('Authorization', bearer(ic))
      .send({ decision: 'APPROVED' });

    expect(decided.status).toBe(200);
    expect(decided.body.swap.status).toBe('APPROVED');

    const moved = await prisma.shiftAssignment.findUnique({ where: { id: assignmentId } });
    expect(moved?.volunteerId).toBe(spare.id);
    // The new person has not arrived. Inheriting a check-in would make the
    // attendance view lie.
    expect(moved?.checkedInAt).toBeNull();
  });

  it('leaves the assignment alone on rejection', async () => {
    const assignmentId = await myAssignment(boothVolunteer);

    const swap = await request(app)
      .post('/api/v1/roster/swaps')
      .set('Authorization', bearer(boothVolunteer))
      .send({ assignmentId, targetVolunteerId: spare.id });

    await request(app)
      .post(`/api/v1/roster/swaps/${swap.body.swap.id}/decide`)
      .set('Authorization', bearer(ic))
      .send({ decision: 'REJECTED' });

    const unchanged = await prisma.shiftAssignment.findUnique({ where: { id: assignmentId } });
    expect(unchanged?.volunteerId).toBe(boothVolunteer.id);
  });

  it('denies a volunteer deciding a swap', async () => {
    const swap = await request(app)
      .post('/api/v1/roster/swaps')
      .set('Authorization', bearer(boothVolunteer))
      .send({ assignmentId: await myAssignment(boothVolunteer), targetVolunteerId: spare.id });

    const response = await request(app)
      .post(`/api/v1/roster/swaps/${swap.body.swap.id}/decide`)
      .set('Authorization', bearer(spare))
      .send({ decision: 'APPROVED' });

    expect(response.status).toBe(403);
  });

  it('refuses to decide the same swap twice', async () => {
    const swap = await request(app)
      .post('/api/v1/roster/swaps')
      .set('Authorization', bearer(boothVolunteer))
      .send({ assignmentId: await myAssignment(boothVolunteer), targetVolunteerId: spare.id });

    await request(app)
      .post(`/api/v1/roster/swaps/${swap.body.swap.id}/decide`)
      .set('Authorization', bearer(ic))
      .send({ decision: 'APPROVED' });

    const second = await request(app)
      .post(`/api/v1/roster/swaps/${swap.body.swap.id}/decide`)
      .set('Authorization', bearer(ic))
      .send({ decision: 'REJECTED' });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SWAP_NOT_PENDING');
  });
});

describe('briefing waves', () => {
  it('lists the slots for a day with a countdown', async () => {
    await prisma.briefingSlot.create({
      data: {
        eventDayId,
        startsAt: new Date(Date.now() + 20 * 60_000),
        briefierId: chief.id,
        waveSize: 20,
      },
    });

    const response = await request(app)
      .get('/api/v1/roster/briefing-slots')
      .set('Authorization', bearer(chief));

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].isMine).toBe(true);
    expect(response.body.data[0].minutesUntilStart).toBe(20);
  });

  it('lets the assigned briefer mark their slot complete', async () => {
    const slot = await prisma.briefingSlot.create({
      data: { eventDayId, startsAt: new Date(), briefierId: chief.id, waveSize: 20 },
    });

    const response = await request(app)
      .post(`/api/v1/roster/briefing-slots/${slot.id}/complete`)
      .set('Authorization', bearer(chief))
      .send({ notes: 'Full wave, all four points covered' });

    expect(response.status).toBe(200);
    expect(response.body.slot.completedAt).not.toBeNull();
  });

  it('refuses to let someone else complete an assigned slot', async () => {
    const slot = await prisma.briefingSlot.create({
      data: { eventDayId, startsAt: new Date(), briefierId: chief.id, waveSize: 20 },
    });

    const response = await request(app)
      .post(`/api/v1/roster/briefing-slots/${slot.id}/complete`)
      .set('Authorization', bearer(boothVolunteer))
      .send({});

    expect(response.status).toBe(403);
  });
});
