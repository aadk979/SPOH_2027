import { RenameEventResponse } from '@spoh/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, testEvent, type TestVolunteer } from '../helpers/fixtures.js';

/**
 * The event's name is the event's own (`Event.name`): its Chief and Admin rename
 * it from the settings screen, from the name they read, with an audit entry.
 */
const app = createApp();
const NAME = 'Test Event';

let eventId: string;
let chief: TestVolunteer;
let eventAdmin: TestVolunteer;
let lead: TestVolunteer;

const rename = (who: TestVolunteer, body: object) =>
  request(app)
    .patch(`/api/v1/events/${eventId}/admin/event-name`)
    .set('Authorization', bearer(who))
    .send(body);
const storedName = async () =>
  (await rawDb.event.findUniqueOrThrow({ where: { id: eventId } })).name;
const renames = () => rawDb.auditLog.findMany({ where: { action: 'event.rename' } });

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  chief = await createVolunteer({ email: 'chief@rename.test', role: 'CHIEF_COORDINATOR' });
  eventAdmin = await createVolunteer({ email: 'admin@rename.test', role: 'ADMIN' });
  lead = await createVolunteer({ email: 'lead@rename.test', role: 'LEAD' });
});

describe('renaming the event', () => {
  it('lets the Chief and an Admin rename it, privately, with the before and after audited', async () => {
    const first = await rename(chief, { name: '  SPOH 2027 dry run  ', expectedName: NAME });
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(RenameEventResponse.parse(first.body).event).toMatchObject({
      id: eventId,
      name: 'SPOH 2027 dry run',
    });
    expect(await storedName()).toBe('SPOH 2027 dry run');

    const second = await rename(eventAdmin, {
      name: 'SPOH 2027',
      expectedName: 'SPOH 2027 dry run',
    });
    expect(second.status).toBe(200);
    expect(await storedName()).toBe('SPOH 2027');

    expect(await renames()).toMatchObject([
      {
        eventId,
        actorId: chief.id,
        entityType: 'Event',
        entityId: eventId,
        before: { name: NAME },
        after: { name: 'SPOH 2027 dry run' },
      },
      {
        actorId: eventAdmin.id,
        before: { name: 'SPOH 2027 dry run' },
        after: { name: 'SPOH 2027' },
      },
    ]);
  });

  it('shows the new name wherever the event is read', async () => {
    await rename(chief, { name: 'Renamed event', expectedName: NAME });
    const me = await request(app).get('/api/v1/me').set('Authorization', bearer(lead));
    expect(me.body.event.name).toBe('Renamed event');
    const mine = await request(app).get('/api/v1/events').set('Authorization', bearer(lead));
    expect(mine.body.data.map((event: { name: string }) => event.name)).toEqual(['Renamed event']);
  });

  it('refuses anyone without config.manage, and writes nothing', async () => {
    const response = await rename(lead, { name: 'Renamed event', expectedName: NAME });
    expect(response.status).toBe(403);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(await storedName()).toBe(NAME);
    expect(await renames()).toEqual([]);
  });

  it('uses the current event role, not the one the session started with', async () => {
    await rawDb.eventMembership.updateMany({
      where: { eventId, personId: eventAdmin.id },
      data: { role: 'LEAD' },
    });
    const response = await rename(eventAdmin, { name: 'Renamed event', expectedName: NAME });
    expect(response.status).toBe(403);
    expect(await storedName()).toBe(NAME);
  });

  it('refuses a rename from a stale read, naming the current name', async () => {
    await rename(chief, { name: 'Chief’s name', expectedName: NAME });
    const stale = await rename(eventAdmin, { name: 'Admin’s name', expectedName: NAME });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT');
    expect(stale.body.error.details).toEqual({ current: 'Chief’s name' });
    expect(await storedName()).toBe('Chief’s name');
    expect(await renames()).toHaveLength(1);
  });

  it('treats a repeated rename as done, without a second audit entry', async () => {
    await rename(chief, { name: 'Renamed event', expectedName: NAME });
    const repeat = await rename(chief, { name: 'Renamed event', expectedName: NAME });
    expect(repeat.status).toBe(200);
    expect(repeat.body.event.name).toBe('Renamed event');
    expect(await renames()).toHaveLength(1);
  });

  it('keeps the name within the clone rules: 2 to 120 characters once trimmed', async () => {
    for (const name of ['', '   ', 'x', ' x ', 'x'.repeat(121)])
      expect((await rename(chief, { name, expectedName: NAME })).status).toBe(400);
    expect((await rename(chief, { name: 'Renamed event' })).status).toBe(400);
    expect(
      (await rename(chief, { name: 'Renamed event', expectedName: NAME, slug: 'other' })).status,
    ).toBe(400);
    expect(await storedName()).toBe(NAME);
    expect((await rename(chief, { name: 'x'.repeat(120), expectedName: NAME })).status).toBe(200);
  });

  it('refuses to rename an archived event', async () => {
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
    const response = await rename(chief, { name: 'Renamed event', expectedName: NAME });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SETTING_LOCKED');
    expect(await storedName()).toBe(NAME);
    expect(await renames()).toEqual([]);
  });
});
