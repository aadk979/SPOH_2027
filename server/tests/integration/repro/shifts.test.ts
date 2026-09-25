import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import { getLongShifts } from '../../../src/modules/shift/service.js';
import { resetDatabase } from '../../helpers/db.js';
import { FROZEN_NOW } from '../../setup.js';
import {
  assignToStation,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  type TestVolunteer,
} from '../../helpers/fixtures.js';

/**
 * P03 bug reproductions: swaps, check-in/out, briefing slots and long-shift
 * warnings. Skipped until fixed; each asserts the correct behaviour and fails
 * today. The suite clock is frozen at 11:30 Singapore on 7 January 2027,
 * inside the MORNING block.
 */

let app: Express;
let owner: TestVolunteer;
let first: TestVolunteer;
let second: TestVolunteer;
let ic: TestVolunteer;
let dayId: string;
let stationId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  dayId = (await createEventDayToday()).id;
  stationId = (await createStation({ code: 'DCS' })).id;
  owner = await createVolunteer({ email: 'owner@shift.test', role: 'VOLUNTEER' });
  first = await createVolunteer({ email: 'first@shift.test', role: 'VOLUNTEER' });
  second = await createVolunteer({ email: 'second@shift.test', role: 'VOLUNTEER' });
  ic = await createVolunteer({ email: 'ic@shift.test', role: 'IC' });
});

afterEach(() => {
  vi.setSystemTime(FROZEN_NOW);
});

function askSwap(assignmentId: string, target: TestVolunteer): request.Test {
  return request(app)
    .post('/api/v1/roster/swaps')
    .set('Authorization', bearer(owner))
    .send({ assignmentId, targetVolunteerId: target.id });
}

function decide(swapId: string, decision: 'APPROVED' | 'REJECTED'): request.Test {
  return request(app)
    .post(`/api/v1/roster/swaps/${swapId}/decide`)
    .set('Authorization', bearer(ic))
    .send({ decision });
}

async function presentToday(volunteer: TestVolunteer): Promise<void> {
  await prisma.attendance.create({
    data: { volunteerId: volunteer.id, eventDayId: dayId, method: 'ROOT', presentAt: new Date() },
  });
}

describe('shifts and swaps (P03 repros)', () => {
  // F03-005
  it.skip('does not move a shift away from someone who never agreed, on a stale swap request', async () => {
    const shift = await assignToStation({ volunteerId: owner.id, stationId, eventDayId: dayId });
    const toFirst = (await askSwap(shift.id, first)).body.swap.id as string;
    const toSecond = (await askSwap(shift.id, second)).body.swap.id as string;

    expect((await decide(toFirst, 'APPROVED')).status).toBe(200);

    // The shift now belongs to `first`. Approving the owner's other request
    // would hand `first`'s shift to `second`.
    const stale = await decide(toSecond, 'APPROVED');
    expect(stale.status).toBe(409);
    const row = await prisma.shiftAssignment.findUniqueOrThrow({ where: { id: shift.id } });
    expect(row.volunteerId).toBe(first.id);
  });

  // F03-006
  it.skip('applies exactly one of two simultaneous decisions on a swap', async () => {
    // A race: five rounds make it lose every run.
    const statuses: number[][] = [];
    for (let round = 0; round < 5; round += 1) {
      const day = await prisma.eventDay.create({
        data: { date: new Date(Date.UTC(2027, 1, 1 + round)), label: `Round ${round}` },
      });
      const shift = await assignToStation({ volunteerId: owner.id, stationId, eventDayId: day.id });
      const swapId = (await askSwap(shift.id, first)).body.swap.id as string;
      const pair = await Promise.all([decide(swapId, 'APPROVED'), decide(swapId, 'REJECTED')]);
      statuses.push(pair.map((response) => response.status).sort());
    }

    expect(statuses).toEqual(Array(5).fill([200, 409]));
  });

  // F03-015
  it.skip('does not move the check-out time when check-out is tapped twice', async () => {
    const shift = await assignToStation({ volunteerId: owner.id, stationId, eventDayId: dayId });
    await presentToday(owner);
    const call = (path: string) =>
      request(app)
        .post(`/api/v1/me/${path}`)
        .set('Authorization', bearer(owner))
        .send({ assignmentId: shift.id });

    expect((await call('check-in')).status).toBe(200);
    expect((await call('check-out')).status).toBe(200);
    const firstOut = (await prisma.shiftAssignment.findUniqueOrThrow({ where: { id: shift.id } }))
      .checkedOutAt;

    vi.setSystemTime(new Date(FROZEN_NOW.getTime() + 90 * 60_000));
    const again = await call('check-out');

    expect(again.status).toBe(409);
    const row = await prisma.shiftAssignment.findUniqueOrThrow({ where: { id: shift.id } });
    expect(row.checkedOutAt).toEqual(firstOut);
  });

  // F03-026
  it.skip('reports a check-in outside the running block as a conflict, not a permission denial', async () => {
    const later = await assignToStation({
      volunteerId: owner.id,
      stationId,
      eventDayId: dayId,
      block: 'AFTERNOON',
    });
    await presentToday(owner);

    const response = await request(app)
      .post('/api/v1/me/check-in')
      .set('Authorization', bearer(owner))
      .send({ assignmentId: later.id });

    expect(response.status).toBe(409);
  });

  // F03-016
  it.skip('does not let a volunteer mark an unassigned briefing wave as done', async () => {
    const slot = await prisma.briefingSlot.create({
      data: { eventDayId: dayId, startsAt: new Date(FROZEN_NOW.getTime() - 60 * 60_000) },
    });

    const response = await request(app)
      .post(`/api/v1/roster/briefing-slots/${slot.id}/complete`)
      .set('Authorization', bearer(owner))
      .send({});

    expect(response.status).toBe(403);
  });

  // F03-016
  it.skip('lets an IC complete a wave assigned to someone else, as the error message promises', async () => {
    const slot = await prisma.briefingSlot.create({
      data: {
        eventDayId: dayId,
        startsAt: new Date(FROZEN_NOW.getTime() - 60 * 60_000),
        briefierId: first.id,
      },
    });

    const response = await request(app)
      .post(`/api/v1/roster/briefing-slots/${slot.id}/complete`)
      .set('Authorization', bearer(ic))
      .send({});

    expect(response.status).toBe(200);
  });

  // F03-023
  it.skip('does not warn about a shift from a previous day that nobody checked out of', async () => {
    const yesterday = await prisma.eventDay.create({
      data: { date: new Date('2027-01-06T00:00:00.000Z'), label: 'Day 0' },
    });
    const old = await assignToStation({
      volunteerId: owner.id,
      stationId,
      eventDayId: yesterday.id,
    });
    await prisma.shiftAssignment.update({
      where: { id: old.id },
      data: { checkedInAt: new Date('2027-01-06T02:00:00.000Z') },
    });

    const warnings = await getLongShifts(FROZEN_NOW);
    expect(warnings).toEqual([]);
  });
});
