import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NoticeListResponse, NoticeDetailResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { noticeSourceReaders } from '../../src/app/noticeSources.js';
import { queueNotices, materialiseNotices } from '../../src/modules/notification/index.js';
import { claimNoticeRows } from '../../src/modules/notification/data/noticeDeliveryRepo.js';
import { executeNoticeDelivery } from '../../src/modules/notification/application/deliverNoticeBatch.js';
import { materialiseAnnouncementNoticeHistory } from '../../src/modules/announcement/index.js';
import { readArchiveNoticeSource } from '../../src/modules/event/index.js';
import { sourceInput } from '../../src/modules/notification/application/noticeProjection.js';
import { createReadContext } from '../../src/platform/access/currentRead.js';
import { useAuthorizer } from '../../src/platform/access/engine.js';
import { prisma } from '../../src/platform/db/client.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { invalidateVolunteerCache } from '../../src/platform/identity/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, createVolunteer, createStation, createEventDayToday, shiftOn, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
const base = '/api/v1/notification-centre';
let eventId: string;
let person: TestVolunteer;
let other: TestVolunteer;
let memberId: string;
let context: { stationId: string; eventDayId: string; shiftId: string };
beforeEach(async () => {
  useAuthorizer(null); vi.restoreAllMocks(); await resetDatabase();
  eventId = (await testEvent()).eventId;
  person = await createVolunteer({ email: 'notice-owner@example.test', role: 'VOLUNTEER' });
  other = await createVolunteer({ email: 'notice-other@example.test', role: 'ADMIN' });
  memberId = (await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: person.id } })).id;
  const station = await createStation({ code: 'NOTICE-STATION' });
  const day = await createEventDayToday();
  context = { stationId: station.id, eventDayId: day.id, shiftId: await shiftOn(day.id) };
});
afterEach(() => { useAuthorizer(null); vi.restoreAllMocks(); });

const input = (id = randomUUID(), recipientPersonIds = [person.id]) => ({
  kind: 'ASSIGNMENT_REMOVED' as const, priority: 'OPERATIONAL' as const,
  source: { kind: 'ASSIGNMENT' as const, id }, transitionKey: `assignment:${id}:change:committed`,
  context: { type: 'assignment' as const, operation: 'REMOVED' as const, ...context },
  createdAt: FROZEN_NOW, recipientPersonIds,
});
const queue = (record = input()) => prisma.$transaction((tx) => queueNotices(tx, { eventId }, record));
const list = (owner = person, query = '') => request(app).get(`${base}${query}`).set('Authorization', bearer(owner));
const ownRow = () => rawDb.notice.findFirstOrThrow({ where: { eventId, recipientPersonId: person.id } });
const device = () => rawDb.pushSubscription.create({ data: { volunteerId: person.id,
  endpoint: `https://push.example.test/${randomUUID()}`, p256dh: 'fixture-key', auth: 'fixture-auth' } });
const claim = async () => (await prisma.$transaction((tx) => claimNoticeRows(tx, {
  workerId: 'notice-worker', now: FROZEN_NOW, leaseUntil: new Date(FROZEN_NOW.getTime() + 60000) })))[0]!;

it('commits one transition and eligible devices together, deduplicates retries and rolls back source with notice failure', async () => {
  await device();
  await rawDb.noticePreference.create({ data: { personId: person.id, operationalPush: true } });
  const record = input();
  const results = await Promise.all([queue(record), queue(record)]);
  expect(results.reduce((sum, row) => sum + row.created, 0)).toBe(1);
  expect(await rawDb.noticeDelivery.count()).toBe(1);
  await expect(prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { name: 'Rolled back source change' } });
    await queueNotices(tx, { eventId }, input());
    throw new Error('source failed');
  })).rejects.toThrow('source failed');
  expect(await rawDb.notice.count()).toBe(1);
  expect((await rawDb.event.findUniqueOrThrow({ where: { id: eventId } })).name).toBe('Test Event');
  expect(JSON.stringify(await rawDb.noticeDelivery.findFirst())).not.toMatch(/fixture-key|fixture-auth|https:/);
});
it('retains default operational centre history without device work and materialises history without re-sending it', async () => {
  await device(); await queue();
  expect(await rawDb.noticeDelivery.count()).toBe(0);
  const record = input();
  await prisma.$transaction((tx) => materialiseNotices(tx, { eventId }, record));
  await prisma.$transaction((tx) => materialiseNotices(tx, { eventId }, record));
  expect(await rawDb.notice.count()).toBe(2);
  expect(await rawDb.noticeDelivery.count()).toBe(0);
});
it('owns detail/read/cursors and leaves source acknowledgements untouched', async () => {
  await queue(); const notice = await ownRow();
  const page = await list().expect(200);
  expect(NoticeListResponse.safeParse(page.body).success).toBe(true);
  expect(page.body.meta.unreadCount).toBe(1);
  await request(app).get(`${base}/${notice.id}`).set('Authorization', bearer(other)).expect(404);
  await list(other, `?cursor=${notice.id}`).expect(404);
  await request(app).put(`${base}/${notice.id}/read`).set('Authorization', bearer(other)).send({}).expect(404);
  const read = await request(app).put(`${base}/${notice.id}/read`).set('Authorization', bearer(person)).send({}).expect(200);
  expect(NoticeDetailResponse.safeParse(read.body).success).toBe(true);
  const second = await request(app).put(`${base}/${notice.id}/read`).set('Authorization', bearer(person)).send({}).expect(200);
  expect(second.body.data.readAt).toBe(read.body.data.readAt);
  expect(await rawDb.announcementAck.count()).toBe(0);
  expect(await rawDb.lostPersonAck.count()).toBe(0);
  expect(await rawDb.auditLog.count({ where: { action: 'notification.read' } })).toBe(1);
  expect((await list(person, '?unreadOnly=true').expect(200)).body.data).toEqual([]);
  await list(person, `?unreadOnly=true&cursor=${notice.id}`).expect(404);
});
it('skips hidden rows using a last-scanned cursor and gives equal timestamps deterministic order', async () => {
  const record = input();
  await rawDb.notice.createMany({ data: Array.from({ length: 501 }, (_, index) => ({
    id: `hidden-${String(index).padStart(4, '0')}`, eventId, recipientPersonId: person.id,
    recipientMembershipId: memberId, kind: 'INCIDENT_RAISED', priority: 'URGENT', sourceKind: 'INCIDENT',
    sourceId: `gone-${index}`, transitionKey: `incident:gone-${index}:raised`, context: { type: 'incident' }, createdAt: FROZEN_NOW,
  })) });
  const first = await list(person, '?limit=1').expect(200);
  expect(first.body.data).toEqual([]);
  expect(first.body.meta.nextCursor).toBe('hidden-0001');
  expect(first.body.meta.unreadCountComplete).toBe(false);
  const second = await list(person, `?limit=1&cursor=${first.body.meta.nextCursor}`).expect(200);
  expect(second.body.meta.nextCursor).toBeNull();
  await queue(record);
  const seen = await list(person, `?limit=25&cursor=${first.body.meta.nextCursor}`).expect(200);
  expect(seen.body.data.map((row: { title: string }) => row.title)).toContain('Assignment removed');
});
it('propagates an authorization engine failure instead of a successful empty private view', async () => {
  await queue();
  useAuthorizer({ isAuthorized: async () => Promise.reject(new Error('fixture engine unavailable')),
    batch: async () => Promise.reject(new Error('fixture engine unavailable')) });
  await list().expect(503);
});
it('removes notices from the current view after standing is revoked', async () => {
  await queue(); const notice = await ownRow();
  await rawDb.eventMembership.update({ where: { id: memberId }, data: { status: 'DEACTIVATED' } });
  invalidateVolunteerCache();
  expect((await list().expect(200)).body.data).toEqual([]);
  await request(app).get(`${base}/${notice.id}`).set('Authorization', bearer(person)).expect(404);
});
it('shows archive readiness to an owning platform person without an event membership and revokes it with organisation authority', async () => {
  const event = await rawDb.event.update({ where: { id: eventId }, data: { status: 'CLOSED',
    closedAt: new Date(FROZEN_NOW.getTime() - 24 * 60 * 60_000) } });
  const version = event.lifecycleVersion;
  await rawDb.eventMembership.delete({ where: { id: memberId } });
  await rawDb.organisationMembership.create({ data: { organisationId: event.organisationId, personId: person.id, role: 'PLATFORM_ADMIN' } });
  const queued = await prisma.$transaction((tx) => queueNotices(tx, { eventId }, { kind: 'ARCHIVE_REMINDER', priority: 'OPERATIONAL',
    source: { kind: 'EVENT', id: eventId }, transitionKey: `event:${eventId}:archive:${version}`,
    context: { type: 'event', lifecycleVersion: version }, createdAt: FROZEN_NOW, recipientPersonIds: [person.id, other.id] }));
  expect(queued).toEqual({ created: 1 });
  const notice = await ownRow();
  expect(notice).toMatchObject({ kind: 'ARCHIVE_REMINDER', sourceKind: 'EVENT', sourceId: eventId,
    recipientPersonId: person.id, context: { type: 'event', lifecycleVersion: version },
    transitionKey: `event:${eventId}:archive:${version}` });
  expect(notice.recipientMembershipId).toBeNull();
  const current = createReadContext({ db: prisma, scope: { eventId }, personId: person.id, now: FROZEN_NOW });
  expect(await current.canRead({ action: 'Platform.AdministerEvent', asPerson: true,
    resource: { type: 'Event', id: eventId } })).toBe(true);
  const authority = vi.spyOn(current, 'canRead');
  expect(sourceInput(notice)).toMatchObject({ kind: 'ARCHIVE_REMINDER', recipientPersonId: person.id,
    source: { kind: 'EVENT', id: eventId }, context: { type: 'event', lifecycleVersion: version },
    transitionKey: `event:${eventId}:archive:${version}` });
  const source = await readArchiveNoticeSource(current, sourceInput(notice));
  expect(authority).toHaveBeenCalledWith({ action: 'Platform.AdministerEvent', asPerson: true,
    resource: { type: 'Event', id: eventId } });
  expect(await authority.mock.results[0]?.value).toBe(true);
  expect(await rawDb.event.findUnique({ where: { id: eventId }, select: { status: true, lifecycleVersion: true } }))
    .toEqual({ status: 'CLOSED', lifecycleVersion: version });
  expect(source?.destination).toEqual({ type: 'platform', path: '/events', eventId });
  const page = await list().expect(200);
  expect(page.body.data).toHaveLength(1);
  expect(page.body.data[0].destination).toEqual({ type: 'platform', path: '/events', eventId });
  expect(await rawDb.notice.count()).toBe(1);
  const reopened = await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
  expect(reopened.lifecycleVersion).toBe(version + 1);
  expect((await list().expect(200)).body.data).toEqual([]);
  await request(app).get(`${base}/${notice.id}`).set('Authorization', bearer(person)).expect(404);
  const closedAgain = await rawDb.event.update({ where: { id: eventId }, data: { status: 'CLOSED' } });
  expect(closedAgain.lifecycleVersion).toBe(version + 2);
  expect((await list().expect(200)).body.data).toEqual([]);
  await request(app).get(`${base}/${notice.id}`).set('Authorization', bearer(person)).expect(404);
  const currentKey = `event:${eventId}:archive:${closedAgain.lifecycleVersion}`;
  expect(await prisma.$transaction((tx) => queueNotices(tx, { eventId }, { kind: 'ARCHIVE_REMINDER', priority: 'OPERATIONAL',
    source: { kind: 'EVENT', id: eventId }, transitionKey: currentKey,
    context: { type: 'event', lifecycleVersion: closedAgain.lifecycleVersion }, createdAt: FROZEN_NOW,
    recipientPersonIds: [person.id, other.id] }))).toEqual({ created: 1 });
  const currentNotice = await rawDb.notice.findFirstOrThrow({ where: { eventId, recipientPersonId: person.id, transitionKey: currentKey } });
  expect((await list().expect(200)).body.data.map((row: { id: string }) => row.id)).toEqual([currentNotice.id]);
  expect(await rawDb.notice.count()).toBe(2);
  await rawDb.organisationMembership.deleteMany({ where: { personId: person.id } });
  expect((await list().expect(200)).body.data).toEqual([]);
  await request(app).get(`${base}/${currentNotice.id}`).set('Authorization', bearer(person)).expect(404);
});
it('fences delivery preference, subscription ownership, lease version and late TTL without external sends', async () => {
  const subscription = await device();
  await rawDb.noticePreference.create({ data: { personId: person.id, operationalPush: true } });
  await queue(); const token = await claim();
  await rawDb.noticePreference.update({ where: { personId: person.id }, data: { operationalPush: false } });
  const send = vi.fn().mockResolvedValue('ACCEPTED' as const);
  expect(await executeNoticeDelivery({ claim: token, clock: fixedClock(FROZEN_NOW), sourceReaders: noticeSourceReaders, send })).toBe('SKIPPED');
  expect(send).not.toHaveBeenCalled();
  expect(await rawDb.noticeDelivery.findFirst()).toMatchObject({ lastError: 'PUSH_DISABLED' });
  expect(await executeNoticeDelivery({ claim: token, clock: fixedClock(FROZEN_NOW), sourceReaders: noticeSourceReaders, send })).toBe('STALE');
  await rawDb.noticePreference.update({ where: { personId: person.id }, data: { operationalPush: true } });
  await queue(); const reassigned = await claim();
  await rawDb.pushSubscription.update({ where: { id: subscription.id }, data: { volunteerId: other.id } });
  expect(await executeNoticeDelivery({ claim: reassigned, clock: fixedClock(FROZEN_NOW), sourceReaders: noticeSourceReaders, send })).toBe('SKIPPED');
  expect(send).not.toHaveBeenCalled();
  expect(await rawDb.noticeDelivery.findFirst({ where: { id: reassigned.id } })).toMatchObject({ lastError: 'SUBSCRIPTION_REASSIGNED' });
});
it('materialises only current recipient-compatible published history and never creates urgent device deliveries', async () => {
  const authorMember = (await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: other.id } })).id;
  await rawDb.announcement.createMany({ data: [
    { eventId, authorId: other.id, authorMembershipId: authorMember, body: 'Visible current history', priority: 'URGENT', targetRole: 'VOLUNTEER', createdAt: FROZEN_NOW },
    { eventId, authorId: other.id, authorMembershipId: authorMember, body: 'Private other role', priority: 'URGENT', targetRole: 'IC', createdAt: FROZEN_NOW },
    { eventId, authorId: other.id, authorMembershipId: authorMember, body: 'Expired history', priority: 'URGENT', expiresAt: new Date(FROZEN_NOW.getTime() - 1), createdAt: FROZEN_NOW },
  ] });
  const run = () => prisma.$transaction((db) => materialiseAnnouncementNoticeHistory(createReadContext({ db,
    scope: { eventId }, personId: person.id, membershipId: memberId, now: FROZEN_NOW })));
  expect(await run()).toEqual({ complete: true }); expect(await run()).toEqual({ complete: true });
  expect(await rawDb.notice.count()).toBe(1);
  expect(await rawDb.noticeDelivery.count()).toBe(0);
  expect(await rawDb.announcementPushDelivery.count()).toBe(0);
  const page = await list().expect(200);
  expect(JSON.stringify(page.body)).toContain('Visible current history');
  expect(JSON.stringify(page.body)).not.toMatch(/Private other role|Expired history/);
});
