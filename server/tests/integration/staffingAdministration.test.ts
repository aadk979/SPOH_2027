import request from 'supertest';
import { beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import * as audit from '../../src/platform/audit/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createEventDayOn,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
  createStation,
  assignToStation,
} from '../helpers/fixtures.js';
import { requestSwap } from '../../src/modules/shift/application/requestSwap.js';
import { decideSwap } from '../../src/modules/shift/application/decideSwap.js';
import { markSlotComplete } from '../../src/modules/shift/application/briefingSlots.js';
import { scheduleBriefing } from '../../src/modules/shift/application/scheduleBriefing.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { reserve } from '../../src/platform/idempotency/index.js';

const app = createApp();
let eventId: string;
let dayId: string;
let admin: TestVolunteer;
let volunteer: TestVolunteer;
const base = () => `/api/v1/events/${eventId}/roster`;
const schedule = (body: object, actor = admin) =>
  request(app).post(`${base()}/briefing-slots`).set('Authorization', bearer(actor)).send(body);
const body = () => ({
  idempotencyKey: idempotencyKey(),
  eventDayId: dayId,
  startsAt: '2027-01-08T01:00:00.000Z',
  briefierId: volunteer.id,
  waveSize: 20,
  notes: 'Bring the route guide.',
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDatabase();
  ({ eventId } = await testEvent());
  dayId = (await createEventDayOn('2027-01-08', 'Future day')).id;
  admin = await createVolunteer({ email: 'staffing-admin@test.example', role: 'ADMIN' });
  volunteer = await createVolunteer({ email: 'staffing-briefer@test.example', role: 'VOLUNTEER' });
});

it('schedules an attributed future briefing once and returns it when its day is selected', async () => {
  const input = body();
  const first = await schedule(input);
  expect(first.status).toBe(201);
  const again = await schedule(input);
  expect(again.body).toEqual(first.body);
  expect(await rawDb.briefingSlot.count()).toBe(1);
  const slot = await rawDb.briefingSlot.findFirstOrThrow();
  expect(slot).toMatchObject({
    eventId,
    eventDayId: dayId,
    briefierId: volunteer.id,
    waveSize: 20,
  });
  expect(slot.briefierMembershipId).toBeTruthy();
  const rows = await request(app)
    .get(`${base()}/briefing-slots?eventDayId=${dayId}`)
    .set('Authorization', bearer(volunteer));
  expect(rows.status).toBe(200);
  expect(rows.body.data).toMatchObject([{ id: slot.id, isMine: true, date: '2027-01-08' }]);
  expect(
    await rawDb.auditLog.count({
      where: { eventId, action: 'briefing.schedule', entityId: slot.id, actorId: admin.id },
    }),
  ).toBe(1);
});

it('refuses unauthorized scheduling and invalid event/day targets before writes', async () => {
  expect((await schedule(body(), volunteer)).status).toBe(403);
  expect((await schedule({ ...body(), eventDayId: 'other-day' })).status).toBe(404);
  expect((await schedule({ ...body(), startsAt: '2027-01-09T01:00:00.000Z' })).status).toBe(400);
  expect((await schedule({ ...body(), briefierId: 'other-person' })).status).toBe(404);
  expect(await rawDb.briefingSlot.count()).toBe(0);
});

it('rolls the briefing back if the audit cannot be written', async () => {
  vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Synthetic audit failure'));
  expect((await schedule(body())).status).toBe(500);
  expect(await rawDb.briefingSlot.count()).toBe(0);
});

it('shows only other active event members in the names-only swap chooser', async () => {
  const other = await createVolunteer({
    email: 'staffing-target@test.example',
    role: 'VOLUNTEER',
    displayName: 'Swap Target',
  });
  const response = await request(app)
    .get(`${base()}/swap-targets`)
    .set('Authorization', bearer(volunteer));
  expect(response.status).toBe(200);
  expect(response.body.data).toEqual(
    expect.arrayContaining([{ id: other.id, displayName: 'Swap Target' }]),
  );
  expect(response.body.data.some((person: { id: string }) => person.id === volunteer.id)).toBe(
    false,
  );
  for (const person of response.body.data)
    expect(Object.keys(person).sort()).toEqual(['displayName', 'id']);
});

async function swapFixture() {
  const station = await createStation({ code: 'STAFFING' });
  const assignment = await assignToStation({
    volunteerId: volunteer.id,
    stationId: station.id,
    eventDayId: dayId,
  });
  const target = await createVolunteer({ email: 'swap-target@test.example', role: 'VOLUNTEER' });
  const input = {
    assignmentId: assignment.id,
    targetVolunteerId: target.id,
    idempotencyKey: idempotencyKey(),
  };
  const call = () =>
    request(app).post(`${base()}/swaps`).set('Authorization', bearer(volunteer)).send(input);
  const created = await call();
  expect(created.status).toBe(201);
  return { id: created.body.swap.id as string, call, input, assignment };
}

it('replays create and decision receipts with names kept out of stored responses', async () => {
  const swap = await swapFixture();
  expect((await swap.call()).body.swap.id).toBe(swap.id);
  expect(await rawDb.shiftSwapRequest.count()).toBe(1);
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: swap.input.idempotencyKey } }))
      .responseBody,
  ).toEqual({ id: swap.id });
  const input = {
    decision: 'APPROVED',
    idempotencyKey: idempotencyKey(),
    note: 'Confirmed coverage.',
  };
  const call = () =>
    request(app)
      .post(`${base()}/swaps/${swap.id}/decide`)
      .set('Authorization', bearer(admin))
      .send(input);
  expect((await call()).status).toBe(200);
  expect((await call()).status).toBe(200);
  expect(await rawDb.auditLog.count({ where: { action: 'swap.decide' } })).toBe(1);
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: input.idempotencyKey } }))
      .responseBody,
  ).toEqual({ id: swap.id });
});

it('withdraws only the requester’s pending swap, with one attributed audit and replay', async () => {
  const swap = await swapFixture();
  const input = { idempotencyKey: idempotencyKey() };
  const call = (actor = volunteer, payload = input) =>
    request(app)
      .post(`${base()}/swaps/${swap.id}/withdraw`)
      .set('Authorization', bearer(actor))
      .send(payload);
  expect((await call(admin, { idempotencyKey: idempotencyKey() })).status).toBe(404);
  expect((await call()).status).toBe(200);
  expect((await call()).status).toBe(200);
  expect((await call(volunteer, { idempotencyKey: idempotencyKey() })).status).toBe(409);
  expect((await rawDb.shiftSwapRequest.findUniqueOrThrow({ where: { id: swap.id } })).status).toBe(
    'CANCELLED',
  );
  expect(
    (await rawDb.shiftAssignment.findUniqueOrThrow({ where: { id: swap.assignment.id } }))
      .volunteerId,
  ).toBe(volunteer.id);
  expect(
    await rawDb.auditLog.count({ where: { action: 'swap.withdraw', actorId: volunteer.id } }),
  ).toBe(1);
});

it('gives withdrawal and approval racing on one request a single winner', async () => {
  const swap = await swapFixture();
  const results = await Promise.all([
    request(app)
      .post(`${base()}/swaps/${swap.id}/withdraw`)
      .set('Authorization', bearer(volunteer))
      .send({ idempotencyKey: idempotencyKey() }),
    request(app)
      .post(`${base()}/swaps/${swap.id}/decide`)
      .set('Authorization', bearer(admin))
      .send({ decision: 'APPROVED', idempotencyKey: idempotencyKey() }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(
    await rawDb.auditLog.count({ where: { action: { in: ['swap.withdraw', 'swap.decide'] } } }),
  ).toBe(1);
});

it('replays a completed briefing and conditionally completes it only once', async () => {
  const id = (await schedule(body())).body.data.id as string;
  const input = { idempotencyKey: idempotencyKey(), notes: 'Points covered.' };
  const call = (payload = input) =>
    request(app)
      .post(`${base()}/briefing-slots/${id}/complete`)
      .set('Authorization', bearer(volunteer))
      .send(payload);
  expect((await call()).status).toBe(200);
  expect((await call()).status).toBe(200);
  expect((await call({ ...input, idempotencyKey: idempotencyKey() })).status).toBe(409);
  expect(
    (await rawDb.idempotencyRecord.findUniqueOrThrow({ where: { key: input.idempotencyKey } }))
      .responseBody,
  ).toEqual({ id });
  expect(await rawDb.auditLog.count({ where: { action: 'roster.edit', entityId: id } })).toBe(1);
});

async function actorFor(person: TestVolunteer) {
  const membership = await rawDb.eventMembership.findFirstOrThrow({
    where: { eventId, personId: person.id },
  });
  return {
    scope: { eventId },
    membershipId: membership.id,
    volunteerId: person.id,
    role: person.role,
    audit: {
      ...SYSTEM_AUDIT_CONTEXT,
      eventId,
      membershipId: membership.id,
      actorId: person.id,
      actorSub: person.sub,
    },
  };
}

it('rechecks current membership authority inside request, decision, completion and scheduling transactions', async () => {
  const swap = await swapFixture();
  const slotId = (await schedule(body())).body.data.id as string;
  const volunteerActor = await actorFor(volunteer);
  const adminActor = await actorFor(admin);
  await rawDb.eventMembership.update({
    where: { id: volunteerActor.membershipId },
    data: { status: 'DEACTIVATED' },
  });
  await expect(
    requestSwap({ assignmentId: swap.assignment.id, targetVolunteerId: admin.id }, volunteerActor),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(markSlotComplete(slotId, {}, volunteerActor)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await rawDb.eventMembership.update({
    where: { id: adminActor.membershipId },
    data: { role: 'VOLUNTEER' },
  });
  await expect(decideSwap(swap.id, { decision: 'REJECTED' }, adminActor)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  const input = body();
  await reserve(input.idempotencyKey, {
    eventId,
    actorSub: admin.sub,
    endpoint: 'briefing.schedule',
  });
  await expect(scheduleBriefing(input, adminActor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect((await rawDb.shiftSwapRequest.findUniqueOrThrow({ where: { id: swap.id } })).status).toBe(
    'REQUESTED',
  );
  expect(
    (await rawDb.briefingSlot.findUniqueOrThrow({ where: { id: slotId } })).completedAt,
  ).toBeNull();
});
