import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonDataExportResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { purgeStaffInTransaction } from '../../src/modules/people/application/staffRetention.js';
import { scheduleArchivedRetention } from '../../src/modules/people/index.js';
import { purgeMediaInTransaction } from '../../src/modules/media/application/retention.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { invalidateVolunteerCache } from '../../src/platform/identity/index.js';
import { prisma } from '../../src/platform/db/client.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createStation, createVolunteer, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

vi.mock('../../src/modules/media/application/s3.js', async (original) => ({
  ...await original<typeof import('../../src/modules/media/application/s3.js')>(),
  deleteMediaObject: vi.fn().mockResolvedValue(undefined),
}));
const app = createApp();
let admin: TestVolunteer;
let person: TestVolunteer;
beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
  admin = await createVolunteer({ email: 'privacy-admin@example.test', role: 'ADMIN' });
  person = await createVolunteer({ email: 'privacy-person@example.test', role: 'VOLUNTEER' });
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: (await testEvent()).eventId } });
  await rawDb.organisationMembership.create({ data: { organisationId: event.organisationId, personId: admin.id, role: 'PLATFORM_ADMIN' } });
  await rawDb.person.update({ where: { id: person.id }, data: { phone: '+6512345678' } });
});
const endpoint = (suffix: string) => `/api/v1/people/${person.id}${suffix}`;
const staffPurge = (now: Date) => prisma.$transaction(async (tx) =>
  purgeStaffInTransaction(tx, await testEvent(), { now, audit: SYSTEM_AUDIT_CONTEXT }));
async function archive(at: Date) {
  const scope = await testEvent();
  await rawDb.event.update({ where: { id: scope.eventId }, data: { status: 'ARCHIVED', archivedAt: at, closedAt: at } });
  await rawDb.eventMembership.updateMany({ where: { eventId: scope.eventId }, data: { status: 'ENDED', deactivatedReason: 'Old personal note' } });
  invalidateVolunteerCache();
  return scope;
}

describe('person data requests', () => {
  it('exports the requested profile without session secrets, push credentials or arbitrary audit payloads', async () => {
    await request(app).post('/api/v1/auth/session').send({ email: person.email }).expect(201);
    const result = await request(app).get(endpoint('/data')).set('Authorization', bearer(admin)).expect(200);
    expect(PersonDataExportResponse.safeParse(result.body).success).toBe(true);
    const serialised = JSON.stringify(result.body);
    expect(serialised).not.toMatch(/tokenHash|refreshToken|providerTokenEncrypted|p256dh/);
    expect(result.body.data.person).toMatchObject({ id: person.id, email: person.email, phone: '+6512345678' });
    expect(result.body.data.activity[0]).not.toHaveProperty('after');
    expect(await rawDb.auditLog.count({ where: { action: 'person.export', entityId: person.id } })).toBe(1);
  });
  it('requires suspension, then anonymises once while preserving membership and audit references', async () => {
    const scope = await testEvent();
    const station = await createStation({ code: 'ERASURE-COUNT', countsEntry: true });
    const capture = await rawDb.footfallTick.create({ data: { eventId: scope.eventId, stationId: station.id,
      recordedById: person.id, quantity: 17, idempotencyKey: randomUUID() } });
    await request(app).post(endpoint('/erase')).set('Authorization', bearer(admin)).send({ reason: 'Subject requested erasure' }).expect(409);
    await request(app).post(endpoint('/deactivate')).set('Authorization', bearer(admin)).send({ reason: 'Subject requested suspension' }).expect(200);
    const key = randomUUID();
    const input = { reason: 'Subject requested erasure', idempotencyKey: key };
    await request(app).post(endpoint('/erase')).set('Authorization', bearer(admin)).send(input).expect(200);
    await request(app).post(endpoint('/erase')).set('Authorization', bearer(admin)).send(input).expect(200);
    expect(await rawDb.person.findUniqueOrThrow({ where: { id: person.id } })).toMatchObject({ phone: null, displayName: 'Archived staff member', piiErasedAt: expect.any(Date), cognitoSub: person.sub });
    expect(await rawDb.eventMembership.count({ where: { personId: person.id } })).toBe(1);
    expect(await rawDb.footfallTick.findUniqueOrThrow({ where: { id: capture.id } })).toMatchObject({ quantity: 17, recordedById: person.id });
    expect(await rawDb.auditLog.count({ where: { action: 'person.erase', entityId: person.id } })).toBe(1);
    const log = await rawDb.auditLog.findFirstOrThrow({ where: { action: 'person.erase' } });
    expect(JSON.stringify(log.after)).not.toContain(person.email);
    await request(app).post(endpoint('/reactivate')).set('Authorization', bearer(admin)).send({}).expect(409);
  });
  it('denies self erasure and refuses cross-organisation export and erasure', async () => {
    await request(app).post(`/api/v1/people/${admin.id}/erase`).set('Authorization', bearer(admin)).send({ reason: 'Own request' }).expect(403);
    const org = await rawDb.organisation.create({ data: { slug: 'foreign-privacy', name: 'Foreign', appName: 'Foreign', defaultTimezone: 'Asia/Singapore' } });
    const event = await rawDb.event.create({ data: { organisationId: org.id, slug: 'foreign', name: 'Foreign', timezone: 'Asia/Singapore' } });
    await rawDb.eventMembership.create({ data: { eventId: event.id, personId: person.id } });
    await request(app).get(endpoint('/data')).set('Authorization', bearer(admin)).expect(403);
    await request(app).post(endpoint('/erase')).set('Authorization', bearer(admin)).send({ reason: 'Cross scope' }).expect(403);
  });
});

describe('archive retention and access', () => {
  it('honours the exact staff deadline, keeps ids/counts and retains a platform administrator', async () => {
    const archivedAt = new Date(FROZEN_NOW.getTime() - 365 * 86400000);
    const scope = await archive(archivedAt);
    expect(await staffPurge(new Date(FROZEN_NOW.getTime() - 1))).toBe(0);
    expect(await staffPurge(FROZEN_NOW)).toBeGreaterThan(0);
    expect(await staffPurge(FROZEN_NOW)).toBe(0);
    expect(await rawDb.person.findUniqueOrThrow({ where: { id: person.id } })).toMatchObject({ phone: null, piiErasedAt: FROZEN_NOW });
    expect(await rawDb.person.findUniqueOrThrow({ where: { id: admin.id } })).toMatchObject({ email: admin.email, piiErasedAt: null });
    expect(await rawDb.eventMembership.count({ where: { eventId: scope.eventId } })).toBe(2);
    await request(app).get(`/api/v1/events/${scope.eventId}/admin/volunteers`).set('Authorization', bearer(admin)).expect(200);
    await request(app).post(`/api/v1/events/${scope.eventId}/admin/volunteers/${person.id}/reactivate`).set('Authorization', bearer(admin)).send({}).expect(403);
    await request(app).get(`/api/v1/events/${scope.eventId}/me`).set('Authorization', bearer(person)).expect(403);
    await request(app).post('/api/v1/auth/session').send({ email: admin.email }).expect(201);
  });
  it('preserves a person still working in another event and schedules a deduplicated system deadline', async () => {
    const scope = await archive(new Date(FROZEN_NOW.getTime() - 366 * 86400000));
    const source = await rawDb.event.findUniqueOrThrow({ where: { id: scope.eventId } });
    const event = await rawDb.event.create({ data: { organisationId: source.organisationId, slug: 'remaining-event', name: 'Remaining', timezone: source.timezone } });
    await rawDb.eventMembership.create({ data: { eventId: event.id, personId: person.id } });
    await staffPurge(FROZEN_NOW);
    expect(await rawDb.person.findUniqueOrThrow({ where: { id: person.id } })).toMatchObject({ phone: '+6512345678', piiErasedAt: null });
    const args = { eventId: scope.eventId, archivedAt: FROZEN_NOW, audit: SYSTEM_AUDIT_CONTEXT };
    await prisma.$transaction((tx) => scheduleArchivedRetention(tx, args));
    await prisma.$transaction((tx) => scheduleArchivedRetention(tx, args));
    const jobs = await rawDb.scheduledAction.findMany({ where: { type: 'retention.staff' } });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ createdByPersonId: null, eventId: scope.eventId, runAt: new Date(FROZEN_NOW.getTime() + 365 * 86400000) });
  });
  it('deletes only the closed event media at its deadline and leaves the item and other event untouched', async () => {
    const { deleteMediaObject } = await import('../../src/modules/media/application/s3.js');
    const scope = await testEvent();
    const station = await createStation({ code: 'PRIVACY' });
    const item = await rawDb.lostFoundItem.create({ data: { eventId: scope.eventId, loggedById: person.id,
      itemLabel: 'Found bag', foundAt: FROZEN_NOW, foundStationId: station.id, photoKey: 'lost-found/own-photo.jpg' } });
    const source = await rawDb.event.findUniqueOrThrow({ where: { id: scope.eventId } });
    const other = await rawDb.event.create({ data: { organisationId: source.organisationId, slug: 'other-photo', name: 'Other photo', timezone: source.timezone } });
    const foreign = await rawDb.lostFoundItem.create({ data: { eventId: other.id, loggedById: person.id,
      itemLabel: 'Other bag', foundAt: FROZEN_NOW, photoKey: 'lost-found/other-photo.jpg' } });
    await rawDb.event.update({ where: { id: scope.eventId }, data: { status: 'CLOSED', closedAt: new Date(FROZEN_NOW.getTime() - 30 * 86400000) } });
    const run = (now: Date) => prisma.$transaction((tx) => purgeMediaInTransaction(tx, scope, { now, audit: SYSTEM_AUDIT_CONTEXT }));
    expect(await run(new Date(FROZEN_NOW.getTime() - 1))).toBe(0);
    expect(await run(FROZEN_NOW)).toBe(1);
    expect(await run(FROZEN_NOW)).toBe(0);
    expect(deleteMediaObject).toHaveBeenCalledExactlyOnceWith('lost-found/own-photo.jpg');
    expect(await rawDb.lostFoundItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ photoKey: null, itemLabel: 'Found bag' });
    expect(await rawDb.lostFoundItem.findUniqueOrThrow({ where: { id: foreign.id } })).toMatchObject({ photoKey: 'lost-found/other-photo.jpg' });
  });
});
