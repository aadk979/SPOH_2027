import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StructureResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import * as audit from '../../src/platform/audit/index.js';
import * as metadata from '../../src/modules/structure/data/metadataRepo.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  membershipOf,
  shiftOn,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

const app = createApp();
let chief: TestVolunteer;
let eventId: string;
const path = (suffix = '') => `/api/v1/events/${eventId}/admin/structure${suffix}`;
const post = (suffix: string, fields: object) =>
  request(app)
    .post(path(suffix))
    .set('Authorization', bearer(chief))
    .send({ ...fields, idempotencyKey: randomUUID() });
const patch = (suffix: string, fields: object) =>
  request(app)
    .patch(path(suffix))
    .set('Authorization', bearer(chief))
    .send({ ...fields, idempotencyKey: randomUUID() });
const snapshot = async () =>
  StructureResponse.parse((await request(app).get(path()).set('Authorization', bearer(chief))).body)
    .data;
beforeEach(async () => {
  await resetDatabase();
  chief = await createVolunteer({ email: 'chief-structure@spoh.test', role: 'CHIEF_COORDINATOR' });
  eventId = (await testEvent()).eventId;
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'DRAFT' } });
});

describe('event setup structure metadata', () => {
  it('reads complete event-owned metadata with wall-clock shift exceptions and no-store', async () => {
    await createEventDayToday();
    const response = await request(app).get(path()).set('Authorization', bearer(chief));
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const data = StructureResponse.parse(response.body).data;
    expect(data.eventId).toBe(eventId);
    expect(data.categories.length).toBeGreaterThan(0);
    expect(data.shifts.length).toBe(2);
    expect(data.shifts[0]).toMatchObject({
      overridden: false,
      startLocal: '09:30',
      endLocal: '14:00',
      endsNextDay: false,
    });
  });
  it('creates and edits capabilities, labels and order; refuses retirement while a station uses the type', async () => {
    const created = await post('/types', {
      code: 'DEMO',
      label: 'Demo',
      countsEntry: true,
      sortOrder: 4,
    });
    expect(created.status).toBe(201);
    const id: string = created.body.data.id;
    expect((await patch(`/types/${id}`, { label: 'Renamed' })).body.data).toMatchObject({
      label: 'Renamed',
      countsEntry: true,
      sortOrder: 4,
    });
    const changed = await patch(`/types/${id}`, {
      registersVisitors: true,
      issuesStamp: true,
      redeemsGifts: true,
    });
    expect(changed.status).toBe(200);
    const station = await rawDb.station.create({
      data: { eventId, code: 'ROOM', name: 'Room', typeId: id },
    });
    expect((await patch(`/types/${id}`, { active: false })).status).toBe(409);
    await rawDb.station.update({ where: { id: station.id }, data: { active: false } });
    expect((await patch(`/types/${id}`, { active: false })).status).toBe(200);
    expect((await patch(`/types/${id}`, { active: true })).status).toBe(200);
  });
  it('creates and edits tags without clearing an omitted description', async () => {
    const created = await post('/tags', {
      code: 'GROUP',
      label: 'Group',
      description: 'Keep this description',
    });
    expect(created.status).toBe(201);
    const id: string = created.body.data.id;
    const renamed = await patch(`/tags/${id}`, { label: 'Renamed' });
    expect(renamed.body.data.description).toBe('Keep this description');
    expect(
      (await patch(`/tags/${id}`, { active: false, description: null })).body.data,
    ).toMatchObject({ active: false, description: null });
    expect((await snapshot()).stationTags).toContainEqual(
      expect.objectContaining({ id, active: false }),
    );
  });
  it('creates, orders, relabels and deactivates categories while retaining their stable code', async () => {
    const created = await post('/categories', { code: 'GUEST', label: 'Guest', sortOrder: 2 });
    expect(created.status).toBe(201);
    const id: string = created.body.data.id;
    const edited = await patch(`/categories/${id}`, { label: 'Visitors' });
    expect(edited.body.data).toMatchObject({ code: 'GUEST', label: 'Visitors', sortOrder: 2 });
    expect((await patch(`/categories/${id}`, { sortOrder: 1, active: false })).status).toBe(200);
    const categories = (await snapshot()).categories;
    expect(categories.map((row) => row.sortOrder)).toEqual(
      [...categories.map((row) => row.sortOrder)].sort((a, b) => a - b),
    );
    expect(categories).toContainEqual(
      expect.objectContaining({ id, code: 'GUEST', active: false }),
    );
  });
  it.each(['/types', '/tags', '/categories'])(
    'replays a %s create receipt once and records one audit row',
    async (suffix) => {
      const body = { code: 'REPLAY', label: 'Replay', idempotencyKey: randomUUID() };
      const send = () =>
        request(app).post(path(suffix)).set('Authorization', bearer(chief)).send(body);
      const first = await send();
      const again = await send();
      expect(first.status).toBe(201);
      expect(again.body).toEqual(first.body);
      expect(await rawDb.auditLog.count({ where: { eventId, entityId: first.body.data.id } })).toBe(
        1,
      );
    },
  );
  it.each(['/types', '/tags', '/categories'])(
    'returns safe duplicate/validation and unknown-target errors on %s',
    async (suffix) => {
      expect((await post(suffix, { code: 'TAKEN', label: 'First' })).status).toBe(201);
      expect((await post(suffix, { code: 'TAKEN', label: 'Again' })).status).toBe(409);
      expect((await post(suffix, { code: 'VALID', label: '' })).status).toBe(400);
      expect((await patch(`${suffix}/missing`, { label: 'Unknown' })).status).toBe(404);
      const id = (await post(suffix, { code: 'STABLE', label: 'Stable' })).body.data.id;
      expect((await patch(`${suffix}/${id}`, { code: 'CHANGED', label: 'Changed' })).status).toBe(
        400,
      );
    },
  );
  it('scopes metadata lookups to the current event', async () => {
    const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
    const other = await rawDb.event.create({
      data: {
        organisationId: event.organisationId,
        slug: 'private-structure',
        name: 'Private',
        timezone: event.timezone,
      },
    });
    const category = await rawDb.captureCategory.create({
      data: { eventId: other.id, code: 'PRIVATE', label: 'Private category' },
    });
    expect((await patch(`/categories/${category.id}`, { label: 'Changed' })).status).toBe(404);
    expect((await snapshot()).categories.some((row) => row.id === category.id)).toBe(false);
    expect(
      (await rawDb.captureCategory.findUniqueOrThrow({ where: { id: category.id } })).label,
    ).toBe('Private category');
  });
  it('rolls metadata back when its audit fails', async () => {
    vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Synthetic audit failure'));
    expect((await post('/tags', { code: 'ROLLBACK', label: 'Rollback' })).status).toBe(500);
    expect(await rawDb.stationTag.count({ where: { eventId, code: 'ROLLBACK' } })).toBe(0);
  });
  it('rechecks current membership permission after route admission', async () => {
    const member = await membershipOf(chief.id);
    const original = metadata.lockStructureEvent;
    vi.spyOn(metadata, 'lockStructureEvent').mockImplementationOnce(async (scope, tx) => {
      const event = await original(scope, tx);
      await tx.eventMembership.update({
        where: { eventId, id: member.id },
        data: { role: 'VOLUNTEER' },
      });
      return event;
    });
    expect((await post('/tags', { code: 'REVOKED', label: 'Revoked' })).status).toBe(403);
    expect(await rawDb.stationTag.count({ where: { eventId, code: 'REVOKED' } })).toBe(0);
  });
});

describe('templates and the exceptions grid', () => {
  it('creates templates before days and generates their shifts when a day is added', async () => {
    const created = await post('/templates', {
      code: 'EXTRA',
      label: 'Extra',
      startLocal: '18:00',
      endLocal: '21:00',
    });
    expect(created.status).toBe(201);
    expect(await rawDb.shift.count({ where: { eventId, templateId: created.body.data.id } })).toBe(
      0,
    );
    await createEventDayToday();
    expect(await rawDb.shift.count({ where: { eventId, templateId: created.body.data.id } })).toBe(
      1,
    );
  });
  it('populates existing days, preserves exceptions on template edits, and restores current template hours', async () => {
    await createEventDayToday();
    const created = await post('/templates', {
      code: 'LATE',
      label: 'Late',
      startLocal: '22:00',
      endLocal: '02:00',
      endsNextDay: true,
    });
    expect(created.status).toBe(201);
    const templateId: string = created.body.data.id;
    let shift = (await snapshot()).shifts.find((row) => row.templateId === templateId)!;
    expect(shift).toMatchObject({ startLocal: '22:00', endLocal: '02:00', endsNextDay: true });
    const overridden = await patch(`/shifts/${shift.id}`, {
      operation: 'override',
      startLocal: '21:00',
      endLocal: '01:00',
      endsNextDay: true,
    });
    expect(overridden.status).toBe(200);
    expect(overridden.body.data.overridden).toBe(true);
    expect(
      (
        await patch(`/templates/${templateId}`, {
          startLocal: '20:00',
          endLocal: '23:00',
          endsNextDay: false,
          label: 'Evening',
        })
      ).status,
    ).toBe(200);
    shift = (await snapshot()).shifts.find((row) => row.templateId === templateId)!;
    expect(shift.startLocal).toBe('21:00');
    const restored = await patch(`/shifts/${shift.id}`, { operation: 'restore' });
    expect(restored.body.data).toMatchObject({
      overridden: false,
      startLocal: '20:00',
      endLocal: '23:00',
      endsNextDay: false,
    });
    expect((await patch(`/templates/${templateId}`, { startLocal: '19:00' })).status).toBe(200);
    expect((await snapshot()).shifts.find((row) => row.id === shift.id)?.startLocal).toBe('19:00');
  });
  it('retires empty shifts and repopulates all days on template reactivation', async () => {
    await createEventDayToday();
    const template = (await snapshot()).templates[0]!;
    expect((await patch(`/templates/${template.id}`, { active: false })).status).toBe(200);
    expect(await rawDb.shift.count({ where: { eventId, templateId: template.id } })).toBe(0);
    expect((await patch(`/templates/${template.id}`, { active: true })).status).toBe(200);
    expect(await rawDb.shift.count({ where: { eventId, templateId: template.id } })).toBe(1);
  });
  it('blocks retirement with assignments and rolls back the template activity change', async () => {
    const day = await createEventDayToday();
    const station = await createStation({ code: 'STAFFED' });
    const shift = await shiftOn(day.id, 'MORNING');
    const member = await membershipOf(chief.id);
    await rawDb.shiftAssignment.create({
      data: {
        eventId,
        volunteerId: chief.id,
        membershipId: member.id,
        stationId: station.id,
        eventDayId: day.id,
        shiftId: shift,
        roleLabel: 'Helper',
      },
    });
    const template = (await snapshot()).templates.find((row) => row.code === 'MORNING')!;
    expect((await patch(`/templates/${template.id}`, { active: false })).status).toBe(409);
    expect(
      (await rawDb.shiftTemplate.findUniqueOrThrow({ where: { id: template.id } })).active,
    ).toBe(true);
  });
  it('rejects unknown targets, code changes, invalid partial hours and invalid exceptions', async () => {
    expect((await patch('/templates/missing', { label: 'Unknown' })).status).toBe(404);
    expect((await patch('/shifts/missing', { operation: 'restore' })).status).toBe(404);
    const day = await createEventDayToday();
    const shift = await shiftOn(day.id, 'MORNING');
    const template = (await snapshot()).templates.find((row) => row.code === 'MORNING')!;
    expect((await patch(`/templates/${template.id}`, { startLocal: '18:00' })).status).toBe(400);
    expect((await patch(`/templates/${template.id}`, { code: 'NEW' })).status).toBe(400);
    expect(
      (
        await patch(`/shifts/${shift}`, {
          operation: 'override',
          startLocal: '12:00',
          endLocal: '11:00',
          endsNextDay: false,
        })
      ).status,
    ).toBe(400);
  });
  it.each(['LIVE', 'CLOSED'] as const)(
    'permits relabels at %s while freezing capabilities and hours',
    async (status) => {
      const day = await createEventDayToday();
      const shift = await shiftOn(day.id, 'MORNING');
      const data = await snapshot();
      const type = data.stationTypes[0]!;
      const template = data.templates[0]!;
      await rawDb.event.update({ where: { id: eventId }, data: { status } });
      expect((await patch(`/types/${type.id}`, { label: 'Renamed' })).status).toBe(200);
      expect((await patch(`/types/${type.id}`, { countsEntry: !type.countsEntry })).status).toBe(
        409,
      );
      expect((await patch(`/templates/${template.id}`, { label: 'Renamed' })).status).toBe(200);
      expect((await patch(`/templates/${template.id}`, { endLocal: '17:00' })).status).toBe(409);
      expect((await patch(`/shifts/${shift}`, { operation: 'restore' })).status).toBe(409);
    },
  );
  it('refuses new structure after go-live and rejects archived edits', async () => {
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
    expect((await post('/categories', { code: 'LATE', label: 'Late' })).status).toBe(409);
    const type = (await snapshot()).stationTypes[0]!;
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
    expect([403, 409]).toContain((await patch(`/types/${type.id}`, { label: 'Archived' })).status);
  });
});

describe('safe event-day removal and legacy retry receipts', () => {
  const remove = (id: string, key = randomUUID()) =>
    request(app)
      .delete(path(`/days/${id}`))
      .set('Authorization', bearer(chief))
      .send({ idempotencyKey: key });
  it('removes an unused day and empty shifts atomically and replays the receipt', async () => {
    const day = await createEventDayToday();
    const key = randomUUID();
    const result = await remove(day.id, key);
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({ id: day.id, removed: true });
    expect(await rawDb.shift.count({ where: { eventId, eventDayId: day.id } })).toBe(0);
    expect(await rawDb.eventDay.count({ where: { eventId, id: day.id } })).toBe(0);
    expect((await remove(day.id, key)).body).toEqual(result.body);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'eventDay.remove' } })).toBe(1);
  });
  it('refuses unknown days and days with briefing dependencies', async () => {
    expect((await remove('missing')).status).toBe(404);
    const day = await createEventDayToday();
    await rawDb.briefingSlot.create({
      data: {
        eventId,
        eventDayId: day.id,
        startsAt: new Date('2027-01-07T02:00:00Z'),
        waveSize: 20,
      },
    });
    expect((await remove(day.id)).status).toBe(409);
    expect(await rawDb.eventDay.count({ where: { eventId, id: day.id } })).toBe(1);
  });
  it('refuses removal after event capture, retaining all counts and the day', async () => {
    const day = await createEventDayToday();
    const station = await createStation({ code: 'COUNT' });
    const category = (await snapshot()).categories[0]!;
    const member = await membershipOf(chief.id);
    await rawDb.registration.create({
      data: {
        eventId,
        stationId: station.id,
        recordedById: chief.id,
        recordedByMembershipId: member.id,
        categoryId: category.id,
        idempotencyKey: randomUUID(),
      },
    });
    expect((await remove(day.id)).status).toBe(409);
    expect(await rawDb.registration.count({ where: { eventId } })).toBe(1);
  });
  it('gives keyed legacy station/day creates and edits an atomic retry receipt', async () => {
    const stationBody = {
      code: 'NEW_STATION',
      name: 'New station',
      typeCode: 'OTHER',
      idempotencyKey: randomUUID(),
    };
    const stationsPath = `/api/v1/events/${eventId}/admin/stations`;
    const station = await request(app)
      .post(stationsPath)
      .set('Authorization', bearer(chief))
      .send(stationBody);
    expect(station.status).toBe(201);
    expect(
      (await request(app).post(stationsPath).set('Authorization', bearer(chief)).send(stationBody))
        .body,
    ).toEqual(station.body);
    const stationPatch = { name: 'Renamed station', idempotencyKey: randomUUID() };
    const stationUrl = `${stationsPath}/${station.body.station.id}`;
    expect(
      (await request(app).patch(stationUrl).set('Authorization', bearer(chief)).send(stationPatch))
        .status,
    ).toBe(200);
    expect(
      (await request(app).patch(stationUrl).set('Authorization', bearer(chief)).send(stationPatch))
        .status,
    ).toBe(200);
    const dayBody = {
      date: '2027-01-09',
      label: 'Extra day',
      isPublicDay: false,
      isTourDay: true,
      idempotencyKey: randomUUID(),
    };
    const daysPath = `/api/v1/events/${eventId}/admin/event-days`;
    const day = await request(app).post(daysPath).set('Authorization', bearer(chief)).send(dayBody);
    expect(day.status).toBe(201);
    expect(day.body.eventDay.shifts).toHaveLength(2);
    expect(
      (await request(app).post(daysPath).set('Authorization', bearer(chief)).send(dayBody)).body,
    ).toEqual(day.body);
    const dayPatch = { label: 'Renamed day', idempotencyKey: randomUUID() };
    const dayUrl = `${daysPath}/${day.body.eventDay.id}`;
    const edited = await request(app)
      .patch(dayUrl)
      .set('Authorization', bearer(chief))
      .send(dayPatch);
    expect(edited.body.eventDay).toMatchObject({ isPublicDay: false, isTourDay: true });
    expect(
      (await request(app).patch(dayUrl).set('Authorization', bearer(chief)).send(dayPatch)).body,
    ).toEqual(edited.body);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'station.create' } })).toBe(1);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'station.update' } })).toBe(1);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'eventDay.create' } })).toBe(1);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'eventDay.update' } })).toBe(1);
  });
});
