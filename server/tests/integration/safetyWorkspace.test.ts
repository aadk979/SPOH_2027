import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EntityResponse, RecordsResponse } from '@spoh/shared';
import { announcementWorkspaceSource } from '../../src/modules/announcement/index.js';
import { incidentWorkspaceSource } from '../../src/modules/incident/index.js';
import { lostPersonWorkspaceSource } from '../../src/modules/lostPerson/index.js';
import * as incidentRepo from '../../src/modules/incident/data/workspaceRepo.js';
import * as announcementRepo from '../../src/modules/announcement/data/workspaceRepo.js';
import * as announcementNoticeRepo from '../../src/modules/announcement/data/noticeSourceRepo.js';
import { activeLostPersonCount, openIncidentCounts } from '../../src/modules/dashboard/data/repo.js';
import { createReadContext } from '../../src/platform/access/currentRead.js';
import { useAuthorizer } from '../../src/platform/access/engine.js';
import { prisma } from '../../src/platform/db/client.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { assignToStation, createEventDayToday, createStation, createVolunteer, membershipOf, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

let eventId: string; let member: TestVolunteer; let admin: TestVolunteer; let adminMembershipId: string;
beforeEach(async () => {
  useAuthorizer(null); vi.restoreAllMocks(); await resetDatabase(); eventId = (await testEvent()).eventId;
  member = await createVolunteer({ email: 'workspace-reader@example.test', role: 'VOLUNTEER' });
  admin = await createVolunteer({ email: 'workspace-author@example.test', role: 'ADMIN' });
  adminMembershipId = (await membershipOf(admin.id)).id;
});
afterEach(() => { useAuthorizer(null); vi.restoreAllMocks(); });
async function reader(person = member) {
  const membership = await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: person.id } });
  return createReadContext({ db: prisma, scope: { eventId }, personId: person.id, membershipId: membership.id, now: FROZEN_NOW });
}
async function source(patch: { targetStationId?: string; targetRole?: 'IC'; expiresAt?: Date } = {}) {
  return rawDb.announcement.create({ data: { eventId, body: 'Recipient-only current source body', authorId: admin.id,
    priority: 'URGENT', createdAt: FROZEN_NOW, requiresAck: true, ...patch } });
}
const announcementPage = (context: Awaited<ReturnType<typeof reader>>, cursor?: string) => announcementWorkspaceSource.records!(context,
  { filter: { kind: 'announcements' }, limit: 1, ...(cursor ? { cursor } : {}) });

it('resolves current announcement audience before body and uses the same dataset for count and cursor', async () => {
  const station = await createStation({ code: 'ANNOUNCEMENT-RECIPIENT' });
  const day = await createEventDayToday();
  const assignment = await assignToStation({ volunteerId: member.id, stationId: station.id, eventDayId: day.id });
  const message = await source({ targetStationId: station.id });
  const otherRole = await source({ targetRole: 'IC' });
  const expired = await source({ expiresAt: new Date(FROZEN_NOW.getTime() - 1) });
  const context = await reader();
  const record = await announcementWorkspaceSource.entity(context, { kind: 'announcement', id: message.id });
  expect(EntityResponse.safeParse(record).success).toBe(true);
  expect(JSON.stringify(record)).toContain('Recipient-only current source body');
  expect(await announcementWorkspaceSource.entity(context, { kind: 'announcement', id: otherRole.id })).toBeNull();
  expect(await announcementWorkspaceSource.entity(context, { kind: 'announcement', id: expired.id })).toBeNull();
  const page = await announcementPage(context);
  expect(RecordsResponse.safeParse(page).success).toBe(true);
  expect(page.meta.count).toBe(1); expect(page.aggregate).toEqual({ value: 1, unit: 'announcements' });
  expect(page.data[0]?.id).toBe(message.id);
  await expect(announcementPage(context, otherRole.id)).rejects.toMatchObject({ statusCode: 404 });
  await rawDb.shiftAssignment.delete({ where: { id: assignment.id } });
  expect(await announcementWorkspaceSource.entity(context, { kind: 'announcement', id: message.id })).toBeNull();
  expect((await announcementPage(context)).meta.count).toBe(0);
});
it('rechecks persisted announcement postings in the final page predicate after the audience snapshot changes', async () => {
  const station = await createStation({ code: 'ANNOUNCEMENT-POSTING-RACE' });
  const day = await createEventDayToday();
  const assignment = await assignToStation({ volunteerId: member.id, stationId: station.id, eventDayId: day.id });
  await source({ targetStationId: station.id });
  const original = announcementNoticeRepo.noticeAnnouncementRecipient;
  vi.spyOn(announcementNoticeRepo, 'noticeAnnouncementRecipient').mockImplementation(async (...args) => {
    const audience = await original(...args);
    await rawDb.shiftAssignment.deleteMany({ where: { eventId, id: assignment.id } });
    return audience;
  });
  const page = await announcementPage(await reader());
  expect(page.meta.count).toBe(0); expect(page.data).toEqual([]);
});
it('keeps own live sender history, then serves archive metadata without inheriting write permission or body access', async () => {
  const expired = await source({ expiresAt: new Date(FROZEN_NOW.getTime() - 1) });
  expect(JSON.stringify(await announcementWorkspaceSource.entity(await reader(admin), { kind: 'announcement', id: expired.id })))
    .toContain('Recipient-only current source body');
  const event = await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED', archivedAt: FROZEN_NOW } });
  await rawDb.organisationMembership.create({ data: { organisationId: event.organisationId, personId: admin.id, role: 'PLATFORM_ADMIN' } });
  await rawDb.eventMembership.updateMany({ where: { eventId }, data: { status: 'ENDED' } });
  const archived = await announcementWorkspaceSource.entity(await reader(admin), { kind: 'announcement', id: expired.id });
  expect(archived?.facets).toContainEqual(expect.objectContaining({ name: 'Message', availability: 'denied' }));
  expect(JSON.stringify(archived)).not.toContain('Recipient-only current source body');
  expect(archived?.actions).toEqual([]);
});
it('observes only the recipient own acknowledgement and the author aggregate, and never counts for archive metadata readers', async () => {
  const message = await source();
  const acknowledgedAt = new Date(FROZEN_NOW.getTime() - 1);
  await rawDb.announcementAck.create({ data: { eventId, announcementId: message.id, volunteerId: member.id, ackedAt: acknowledgedAt } });
  const recipient = await announcementWorkspaceSource.entity(await reader(), { kind: 'announcement', id: message.id });
  expect(recipient?.fields).toContainEqual(expect.objectContaining({ label: 'Acknowledged by me', value: true }));
  expect(recipient?.fields).toContainEqual(expect.objectContaining({ label: 'My acknowledgement at', value: acknowledgedAt.toISOString() }));
  expect(recipient?.fields.some((item) => item.label === 'Acknowledgements observed')).toBe(false);
  const sender = await announcementWorkspaceSource.entity(await reader(admin), { kind: 'announcement', id: message.id });
  expect(sender?.fields).toContainEqual(expect.objectContaining({ label: 'Acknowledgements observed', value: 1 }));
  expect(JSON.stringify(sender)).not.toContain(member.email);
  const unrelated = await createVolunteer({ email: 'workspace-audit-only@example.test', role: 'ADMIN' });
  const event = await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED', archivedAt: FROZEN_NOW } });
  await rawDb.organisationMembership.create({ data: { organisationId: event.organisationId, personId: unrelated.id, role: 'PLATFORM_ADMIN' } });
  await rawDb.eventMembership.updateMany({ where: { eventId }, data: { status: 'ENDED' } });
  await rawDb.announcement.update({ where: { id: message.id }, data: { expiresAt: new Date(FROZEN_NOW.getTime() - 1) } });
  const observation = vi.spyOn(announcementRepo, 'announcementWorkspaceAcknowledgements');
  const metadata = await announcementWorkspaceSource.entity(await reader(unrelated), { kind: 'announcement', id: message.id });
  expect(metadata?.facets).toContainEqual(expect.objectContaining({ name: 'Acknowledgements', availability: 'denied' }));
  expect(metadata?.fields.some((item) => item.label === 'Acknowledgements observed' || item.label === 'Acknowledged by me')).toBe(false);
  expect(observation).not.toHaveBeenCalled();
});
it('checks Incident.Read on the exact resource before any body query, and preserves failure as 503', async () => {
  const incident = await rawDb.incident.create({ data: { eventId, type: 'NEAR_MISS', severity: 'HIGH',
    description: 'Private incident source text', reportedById: admin.id, reportedByMembershipId: adminMembershipId, occurredAt: FROZEN_NOW,
    reportedAt: FROZEN_NOW, idempotencyKey: randomUUID() } });
  const body = vi.spyOn(incidentRepo, 'incidentWorkspaceBody');
  await expect(incidentWorkspaceSource.entity(await reader(), { kind: 'incident', id: incident.id })).rejects.toMatchObject({ statusCode: 403 });
  expect(body).not.toHaveBeenCalled();
  useAuthorizer({ isAuthorized: async () => Promise.reject(new Error('synthetic policy failure')),
    batch: async () => Promise.reject(new Error('synthetic policy failure')) });
  await expect(incidentWorkspaceSource.entity(await reader(admin), { kind: 'incident', id: incident.id })).rejects.toMatchObject({ statusCode: 503 });
  expect(body).not.toHaveBeenCalled();
});
it('counts open incidents by the exact event/pool/time predicate and rejects a filtered-out cursor', async () => {
  const create = (status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED', rehearsal = false) => rawDb.incident.create({ data: {
    eventId, type: 'CROWD_CONCERN', severity: 'MEDIUM', status, rehearsal, description: 'Scoped incident', reportedById: admin.id,
    reportedByMembershipId: adminMembershipId,
    occurredAt: FROZEN_NOW, reportedAt: FROZEN_NOW, idempotencyKey: randomUUID(),
  } });
  await create('OPEN'); await create('ACKNOWLEDGED'); const closed = await create('RESOLVED'); await create('OPEN', true);
  const context = await reader(admin);
  const filter = { kind: 'incidents' as const, open: true, asOf: FROZEN_NOW.toISOString() };
  const page = await incidentWorkspaceSource.records!(context, { filter, limit: 1 });
  expect(page.meta.count).toBe(2); expect(page.aggregate).toEqual({ value: 2, unit: 'incidents' });
  expect(page.meta.nextCursor).not.toBeNull();
  await expect(incidentWorkspaceSource.records!(context, { filter, limit: 1, cursor: closed.id })).rejects.toMatchObject({ statusCode: 404 });
  expect(JSON.stringify(page.data)).not.toContain('Scoped incident');
});
it('keeps dashboard safety observations equal to their records at the inclusive snapshot and exact rehearsal pool', async () => {
  const future = new Date(FROZEN_NOW.getTime() + 1);
  for (const row of [{ at: FROZEN_NOW, rehearsal: false }, { at: FROZEN_NOW, rehearsal: true }, { at: future, rehearsal: false }]) {
    await rawDb.lostPersonAlert.create({ data: { eventId, raisedById: admin.id, raisedAt: row.at,
      rehearsal: row.rehearsal, descriptionText: 'Synthetic current safety observation' } });
    await rawDb.incident.create({ data: { eventId, type: 'NEAR_MISS', severity: 'CRITICAL', reportedById: admin.id,
      reportedByMembershipId: adminMembershipId,
      occurredAt: row.at, reportedAt: row.at, rehearsal: row.rehearsal, description: 'Synthetic current safety observation', idempotencyKey: randomUUID() } });
  }
  const context = await reader(admin);
  for (const includeRehearsal of [false, true]) {
    const observation = { asOf: FROZEN_NOW.toISOString(), includeRehearsal };
    const alerts = await lostPersonWorkspaceSource.records!(context, { filter: { kind: 'lost-person', status: 'ACTIVE', ...observation }, limit: 10 });
    expect(alerts.aggregate.value).toBe(await activeLostPersonCount({ eventId, includeRehearsal }, FROZEN_NOW));
    const incidents = await incidentWorkspaceSource.records!(context, { filter: { kind: 'incidents', open: true, severity: 'CRITICAL', ...observation }, limit: 10 });
    expect(incidents.aggregate.value).toBe((await openIncidentCounts({ eventId, includeRehearsal }, FROZEN_NOW)).critical);
    expect(alerts.asOf).toBe(FROZEN_NOW.toISOString()); expect(incidents.asOf).toBe(FROZEN_NOW.toISOString());
  }
  const exclusive = await lostPersonWorkspaceSource.records!(context, { filter: { kind: 'lost-person',
    status: 'ACTIVE', asOf: FROZEN_NOW.toISOString(), to: FROZEN_NOW.toISOString() }, limit: 10 });
  expect(exclusive.meta.count).toBe(0);
});
it('hides resolved lost-person descriptors immediately while a deliberately late worker leaves raw values retained', async () => {
  await rawDb.person.update({ where: { id: admin.id }, data: { phone: '+6500001111' } });
  const alert = await rawDb.lostPersonAlert.create({ data: { eventId, raisedById: admin.id,
    approxAge: 'Synthetic age', descriptionText: 'Transient synthetic description', clothingText: 'Transient synthetic clothing',
    raisedAt: FROZEN_NOW } });
  const context = await reader();
  const active = await lostPersonWorkspaceSource.entity(context, { kind: 'lost-person', id: alert.id });
  expect(JSON.stringify(active)).toContain('Transient synthetic description');
  expect(JSON.stringify(active)).toContain('+6500001111');
  await rawDb.lostPersonAlert.update({ where: { id: alert.id }, data: { status: 'RESOLVED_FOUND', resolvedAt: FROZEN_NOW } });
  expect((await rawDb.lostPersonAlert.findUniqueOrThrow({ where: { id: alert.id } })).descriptionText).not.toBeNull();
  const resolved = await lostPersonWorkspaceSource.entity(context, { kind: 'lost-person', id: alert.id });
  expect(JSON.stringify(resolved)).not.toMatch(/Transient synthetic|Synthetic age|6500001111/);
  expect(resolved?.actions).toEqual([]);
  const page = await lostPersonWorkspaceSource.records!(context, { filter: { kind: 'lost-person', status: 'RESOLVED_FOUND' }, limit: 10 });
  expect(page.meta.count).toBe(1); expect(page.aggregate).toEqual({ value: 1, unit: 'alerts' });
  expect(JSON.stringify(page.data)).not.toMatch(/Transient synthetic|Synthetic age|6500001111/);
});
it('never searches hidden message or transient alert body text', async () => {
  await source({ targetRole: 'IC' });
  await rawDb.lostPersonAlert.create({ data: { eventId, raisedById: admin.id,
    descriptionText: 'Transient unique lookup word', raisedAt: FROZEN_NOW } });
  expect(await announcementWorkspaceSource.search!(await reader(), { query: 'Recipient-only', limit: 20 })).toEqual([]);
  expect(await lostPersonWorkspaceSource.search!(await reader(), { query: 'Transient unique', limit: 20 })).toEqual([]);
});
it('keeps practice alert metadata while hiding descriptors and actions outside rehearsal', async () => {
  const alert = await rawDb.lostPersonAlert.create({ data: { eventId, raisedById: admin.id,
    rehearsal: true, raisedAt: FROZEN_NOW, descriptionText: 'Private rehearsal descriptors' } });
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'LIVE' } });
  const metadata = await lostPersonWorkspaceSource.entity(await reader(), { kind: 'lost-person', id: alert.id });
  expect(JSON.stringify(metadata)).not.toContain('Private rehearsal descriptors');
  expect(metadata?.actions).toEqual([]);
  expect(metadata?.facets).toContainEqual(expect.objectContaining({ name: 'Search descriptors', availability: 'unavailable' }));
});
