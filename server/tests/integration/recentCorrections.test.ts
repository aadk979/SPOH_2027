import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RecentFootfallResponse, RecentRegistrationsResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  categoryId,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

let app: Express;
let chief: TestVolunteer;
let ic: TestVolunteer;
let volunteer: TestVolunteer;
let stationId: string;
let otherStationId: string;
let ids: { registrations: string[]; footfall: string[] };
beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  const day = await createEventDayToday();
  chief = await createVolunteer({ email: 'chief@corrections.test', role: 'CHIEF_COORDINATOR' });
  ic = await createVolunteer({ email: 'ic@corrections.test', role: 'IC' });
  volunteer = await createVolunteer({ email: 'volunteer@corrections.test', role: 'VOLUNTEER' });
  stationId = (await createStation({ code: 'CORRECTIONS', countsEntry: true })).id;
  otherStationId = (await createStation({ code: 'OTHER_CORRECTIONS', countsEntry: true })).id;
  await assignToStationAllBlocks({ volunteerId: ic.id, stationId, eventDayId: day.id });
  const { eventId } = await testEvent();
  const cat = await categoryId('SEC_1');
  ids = { registrations: [], footfall: [] };
  // Same-clock ties must not skip or repeat records when the next page is selected.
  for (const shape of [
    {},
    {},
    {},
    { voided: true },
    { rehearsal: true },
    { stationId: otherStationId },
  ]) {
    const base = {
      eventId,
      recordedById: chief.id,
      stationId,
      recordedAt: FROZEN_NOW,
      idempotencyKey: idempotencyKey(),
      ...shape,
    };
    const registration = await rawDb.registration.create({ data: { ...base, categoryId: cat } });
    const tick = await rawDb.footfallTick.create({
      data: { ...base, idempotencyKey: idempotencyKey(), quantity: 2 },
    });
    if (!('voided' in shape || 'rehearsal' in shape || 'stationId' in shape)) {
      ids.registrations.push(registration.id);
      ids.footfall.push(tick.id);
    }
  }
});

function read(kind: 'registrations' | 'footfall', actor = chief, query: object = {}) {
  return request(app)
    .get(`/api/v1/${kind}/recent`)
    .set('Authorization', bearer(actor))
    .query({ stationId, ...query });
}

describe.each(['registrations', 'footfall'] as const)('recent %s corrections', (kind) => {
  it('pages non-voided live records at the selected station without disclosing identity', async () => {
    const first = await read(kind, chief, { limit: 2 });
    expect(first.status).toBe(200);
    const schema = kind === 'registrations' ? RecentRegistrationsResponse : RecentFootfallResponse;
    expect(schema.safeParse(first.body).success).toBe(true);
    expect(first.body.meta.count).toBe(2);
    expect(first.body.meta.nextCursor).toBe(first.body.data[1].id);
    const second = await read(kind, chief, { limit: 2, cursor: first.body.meta.nextCursor });
    expect(second.status).toBe(200);
    expect(second.body.meta).toEqual({ count: 1, nextCursor: null });
    const all = [...first.body.data, ...second.body.data];
    expect(all.map((row: { id: string }) => row.id).sort()).toEqual(ids[kind].sort());
    for (const row of all) {
      expect(row.stationId).toBe(stationId);
      expect(row.voided).toBe(false);
      expect(row).not.toHaveProperty('visitor');
      expect(row).not.toHaveProperty('recordedById');
    }
  });

  it('selects practice records explicitly and returns an honest empty page', async () => {
    const practice = await read(kind, chief, { rehearsal: 'true' });
    expect(practice.status).toBe(200);
    expect(practice.body.meta).toEqual({ count: 1, nextCursor: null });
    expect(ids[kind]).not.toContain(practice.body.data[0].id);
    const args = {
      where: { eventId: (await testEvent()).eventId, stationId, rehearsal: true },
      data: { voided: true },
    };
    if (kind === 'registrations') await rawDb.registration.updateMany(args);
    else await rawDb.footfallTick.updateMany(args);
    expect((await read(kind, chief, { rehearsal: 'true' })).body).toEqual({
      data: [],
      meta: { count: 0, nextCursor: null },
    });
  });

  it('uses Cedar dashboard authority for ICs and refuses volunteers and unknown stations', async () => {
    expect((await read(kind, ic)).status).toBe(200);
    // Unlike roster PII, event-local operational counts are visible to an IC across stations.
    expect((await read(kind, ic, { stationId: otherStationId })).status).toBe(200);
    expect((await read(kind, volunteer)).status).toBe(403);
    expect((await read(kind, chief, { stationId: 'missing-station' })).status).toBe(404);
    expect((await request(app).get(`/api/v1/${kind}/recent`).query({ stationId })).status).toBe(
      401,
    );
  });

  it('rejects unbounded or malformed queries before reading records', async () => {
    for (const query of [
      { stationId: '' },
      { limit: 1001 },
      { rehearsal: 'yes' },
      { unexpected: 'field' },
    ]) {
      expect((await read(kind, chief, query)).status).toBe(400);
    }
  });
});
