import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PersonDataExportResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { purgeStaffInTransaction } from '../../src/modules/people/application/staffRetention.js';
import * as audit from '../../src/platform/audit/index.js';
import { prisma } from '../../src/platform/db/client.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { assignToStation, bearer, createEventDayToday, createStation, createVolunteer,
  makePlatformAdmin, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let admin: TestVolunteer;
let person: TestVolunteer;
let peer: TestVolunteer;
let eventId: string;
beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
  admin = await createVolunteer({ email: 'completion-admin@test.invalid', role: 'ADMIN' });
  person = await createVolunteer({ email: 'completion-subject@test.invalid', role: 'VOLUNTEER' });
  peer = await createVolunteer({ email: 'completion-peer@test.invalid', role: 'VOLUNTEER' });
  await makePlatformAdmin(admin.id);
});
afterEach(() => vi.restoreAllMocks());

const erase = (key = randomUUID()) => request(app).post(`/api/v1/people/${person.id}/erase`)
  .set('Authorization', bearer(admin)).send({ idempotencyKey: key, reason: 'Subject requested profile erasure' });
async function suspend() {
  await rawDb.person.update({ where: { id: person.id }, data: { deactivatedAt: FROZEN_NOW } });
  await rawDb.eventMembership.updateMany({ where: { personId: person.id }, data: { status: 'DEACTIVATED' } });
}
async function credentials(personId: string, state: 'live' | 'revoked' | 'expired') {
  const id = randomUUID();
  const old = new Date(FROZEN_NOW.getTime() - 60_000);
  const session = await rawDb.refreshSession.create({ data: { id, volunteerId: personId,
    familyId: randomUUID(), tokenHash: randomUUID(), issuedAt: old,
    expiresAt: new Date(FROZEN_NOW.getTime() + (state === 'expired' ? -1 : 60_000)),
    revokedAt: state === 'revoked' ? old : null, revokedReason: state === 'revoked' ? 'old-rotation' : null,
    providerTokenEncrypted: `encrypted-sentinel-${id}`, providerTokenExpiresAt: FROZEN_NOW, mfaPending: true } });
  await rawDb.authHandoff.create({ data: { id: randomUUID(), sessionId: id,
    challenge: `challenge-sentinel-${id}`, expiresAt: new Date(FROZEN_NOW.getTime() + 60_000) } });
  return session;
}

it('exports each subject-owned operational relation, without peers, notes, secrets or cacheable private data', async () => {
  const day = await createEventDayToday();
  const station = await createStation({ code: 'PRIVATE-EXPORT' });
  const assignment = await assignToStation({ volunteerId: person.id, stationId: station.id, eventDayId: day.id });
  const otherAssignment = await assignToStation({ volunteerId: admin.id, stationId: station.id, eventDayId: day.id });
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  await rawDb.organisationMembership.create({ data: { organisationId: event.organisationId, personId: person.id } });
  const attendance = await rawDb.attendance.create({ data: { eventId, volunteerId: person.id,
    eventDayId: day.id, method: 'ROOT', presentAt: FROZEN_NOW } });
  await rawDb.attendance.create({ data: { eventId, volunteerId: peer.id, eventDayId: day.id,
    method: 'ROOT', presentAt: FROZEN_NOW } });
  const requested = await rawDb.shiftSwapRequest.create({ data: { eventId, assignmentId: assignment.id,
    requesterId: person.id, targetId: peer.id, reason: 'Private peer and subject narrative' } });
  const targeted = await rawDb.shiftSwapRequest.create({ data: { eventId, assignmentId: otherAssignment.id,
    requesterId: admin.id, targetId: person.id, reason: 'Other subject narrative' } });
  const decided = await rawDb.shiftSwapRequest.create({ data: { eventId, assignmentId: otherAssignment.id,
    requesterId: admin.id, targetId: peer.id, decidedById: person.id, decidedAt: FROZEN_NOW, status: 'REJECTED' } });
  await rawDb.shiftSwapRequest.create({ data: { eventId, assignmentId: otherAssignment.id,
    requesterId: admin.id, targetId: peer.id, reason: 'Unrelated private narrative' } });
  const slot = await rawDb.briefingSlot.create({ data: { eventId, eventDayId: day.id,
    startsAt: FROZEN_NOW, briefierId: person.id, notes: 'Do not export group notes' } });
  await rawDb.briefingSlot.create({ data: { eventId, eventDayId: day.id, startsAt: FROZEN_NOW, briefierId: peer.id } });
  await credentials(person.id, 'live');
  const result = await request(app).get(`/api/v1/people/${person.id}/data`).set('Authorization', bearer(admin)).expect(200);
  expect(result.headers['cache-control']).toBe('private, no-store');
  const parsed = PersonDataExportResponse.parse(result.body);
  const operational = parsed.data.operational;
  expect(operational.organisationMemberships).toEqual([expect.objectContaining({ organisationId: event.organisationId, role: 'MEMBER' })]);
  expect(operational.attendance).toEqual([expect.objectContaining({ id: attendance.id })]);
  expect(operational.shiftAssignments).toEqual([expect.objectContaining({ id: assignment.id })]);
  expect(operational.swapsRequested).toEqual([expect.objectContaining({ id: requested.id })]);
  expect(operational.swapsTargeted).toEqual([expect.objectContaining({ id: targeted.id })]);
  expect(operational.swapsDecided).toEqual([expect.objectContaining({ id: decided.id })]);
  expect(operational.briefingSlots).toEqual([expect.objectContaining({ id: slot.id })]);
  expect(JSON.stringify(parsed)).not.toMatch(/Private peer|subject narrative|group notes|encrypted-sentinel|challenge-sentinel|tokenHash|providerToken|requesterId|targetId/);
});

it('erases all credential material, counts only live sessions and preserves terminal history on repeated erasure', async () => {
  await suspend();
  const live = await credentials(person.id, 'live');
  const revoked = await credentials(person.id, 'revoked');
  const expired = await credentials(person.id, 'expired');
  const foreign = await credentials(peer.id, 'live');
  const first = await erase().expect(200);
  expect(first.body).toEqual({ identityChanged: false, sessionsRevoked: 1 });
  const subjectRows = await rawDb.refreshSession.findMany({ where: { volunteerId: person.id } });
  expect(subjectRows).toHaveLength(3);
  for (const row of subjectRows) expect(row).toMatchObject({ providerTokenEncrypted: null, providerTokenExpiresAt: null });
  expect(subjectRows.find((row) => row.id === revoked.id)).toMatchObject({ revokedAt: revoked.revokedAt, revokedReason: 'old-rotation' });
  expect(subjectRows.find((row) => row.id === live.id)).toMatchObject({ revokedAt: FROZEN_NOW, revokedReason: 'person-erased' });
  expect(subjectRows.find((row) => row.id === expired.id)).toMatchObject({ revokedAt: FROZEN_NOW, revokedReason: 'person-erased' });
  expect(await rawDb.authHandoff.count({ where: { session: { volunteerId: person.id } } })).toBe(0);
  expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: foreign.id } })).toEqual(foreign);
  expect(await rawDb.authHandoff.count({ where: { sessionId: foreign.id } })).toBe(1);
  const profile = await rawDb.person.findUniqueOrThrow({ where: { id: person.id } });
  await rawDb.refreshSession.update({ where: { id: revoked.id }, data: { providerTokenEncrypted: 'late-terminal-envelope' } });
  await rawDb.authHandoff.create({ data: { id: randomUUID(), sessionId: revoked.id, challenge: 'late-challenge', expiresAt: FROZEN_NOW } });
  const second = await erase().expect(200);
  expect(second.body.sessionsRevoked).toBe(0);
  expect(await rawDb.person.findUniqueOrThrow({ where: { id: person.id } })).toEqual(profile);
  expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: revoked.id } })).toMatchObject({
    providerTokenEncrypted: null, revokedAt: revoked.revokedAt, revokedReason: 'old-rotation' });
  expect(await rawDb.authHandoff.count({ where: { session: { volunteerId: person.id } } })).toBe(0);
  expect(await rawDb.auditLog.count({ where: { action: 'person.erase', entityId: person.id } })).toBe(2);
});

it('rolls profile, credentials, handoffs and retry receipt back when the erasure audit fails', async () => {
  await suspend();
  const session = await credentials(person.id, 'live');
  const profile = await rawDb.person.findUniqueOrThrow({ where: { id: person.id } });
  const key = randomUUID();
  vi.spyOn(audit, 'writeAudit').mockRejectedValueOnce(new Error('Synthetic audit outage'));
  await erase(key).expect(500);
  expect(await rawDb.person.findUniqueOrThrow({ where: { id: person.id } })).toEqual(profile);
  expect(await rawDb.refreshSession.findUniqueOrThrow({ where: { id: session.id } })).toEqual(session);
  expect(await rawDb.authHandoff.count({ where: { sessionId: session.id } })).toBe(1);
  expect(await rawDb.idempotencyRecord.count({ where: { key } })).toBe(0);
});

it('exports and erases unbound planned-subject journals while preserving actor-only attribution', async () => {
  const event = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const journal = (plannedPersonId: string, actorPersonId: string) => rawDb.identityAccountOperation.create({
    data: { id: randomUUID(), targetPoolId: 'ap-southeast-1_privacy', organisationId: event.organisationId,
      plannedPersonId, actorPersonId, emailDigest: randomUUID().replaceAll('-', '').repeat(2),
      profileDigest: 'b'.repeat(64), generation: randomUUID(), createdAt: FROZEN_NOW, updatedAt: FROZEN_NOW,
      leaseExpiresAt: new Date(FROZEN_NOW.getTime() + 60_000) },
  });
  const owned = await journal(person.id, admin.id);
  const actorOnly = await journal(peer.id, person.id);
  const exported = await request(app).get(`/api/v1/people/${person.id}/data`).set('Authorization', bearer(admin)).expect(200);
  expect(exported.body.data.operational.identityAccounts).toEqual([expect.objectContaining({ id: owned.id, state: 'CREATE_STARTED' })]);
  expect(JSON.stringify(exported.body)).not.toMatch(/emailDigest|profileDigest|providerSubject|targetPoolId/);
  await suspend();
  await erase().expect(200);
  expect(await rawDb.identityAccountOperation.findUnique({ where: { id: owned.id } })).toBeNull();
  expect(await rawDb.identityAccountOperation.findUniqueOrThrow({ where: { id: actorOnly.id } })).toEqual(actorOnly);
});

it('expires mutable staff descriptors at the event-specific exact archive deadline and preserves counts and other events', async () => {
  const day = await createEventDayToday();
  const station = await createStation({ code: 'RETAIN-IDS' });
  const assignment = await assignToStation({ volunteerId: person.id, stationId: station.id, eventDayId: day.id });
  const source = await rawDb.event.findUniqueOrThrow({ where: { id: eventId } });
  const other = await rawDb.event.create({ data: { organisationId: source.organisationId,
    name: 'Current other event', slug: 'current-other-privacy', timezone: source.timezone } });
  await rawDb.eventMembership.create({ data: { eventId: other.id, personId: person.id, status: 'ACTIVE' } });
  await rawDb.setting.create({ data: { scope: 'EVENT', scopeId: eventId, eventId,
    key: 'privacy.staffRetentionDays', value: 2, version: 1 } });
  const incident = await rawDb.incident.create({ data: { eventId, reportedById: person.id,
    type: 'OTHER', severity: 'LOW', description: 'Sensitive old source text', locationNote: 'Staff contact detail',
    occurredAt: FROZEN_NOW, idempotencyKey: randomUUID() } });
  const followUp = await rawDb.incidentFollowUp.create({ data: { eventId, incidentId: incident.id,
    rehearsal: false, authorId: person.id, note: 'Sensitive follow-up text' } });
  const item = await rawDb.lostFoundItem.create({ data: { eventId, loggedById: person.id,
    itemLabel: 'Operational bag label', foundAt: FROZEN_NOW, holderNote: 'Sensitive holder contact' } });
  const swap = await rawDb.shiftSwapRequest.create({ data: { eventId, assignmentId: assignment.id,
    requesterId: person.id, targetId: peer.id, reason: 'Sensitive swap reason' } });
  const foreign = await rawDb.incident.create({ data: { eventId: other.id, reportedById: person.id,
    type: 'OTHER', severity: 'LOW', description: 'Current event text', occurredAt: FROZEN_NOW, idempotencyKey: randomUUID() } });
  const archivedAt = new Date(FROZEN_NOW.getTime() - 2 * 86400_000);
  await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED', archivedAt } });
  await rawDb.eventMembership.updateMany({ where: { eventId }, data: { status: 'ENDED',
    deactivatedReason: null, lastSeenAt: FROZEN_NOW } });
  const run = (now: Date) => prisma.$transaction((tx) => purgeStaffInTransaction(tx, { eventId }, { now, audit: SYSTEM_AUDIT_CONTEXT }));
  expect(await run(new Date(FROZEN_NOW.getTime() - 1))).toBe(0);
  expect((await rawDb.incident.findUniqueOrThrow({ where: { id: incident.id } })).description).toBe('Sensitive old source text');
  expect(await run(FROZEN_NOW)).toBeGreaterThan(0);
  expect(await run(new Date(FROZEN_NOW.getTime() + 1))).toBe(0);
  expect(await rawDb.incident.findUniqueOrThrow({ where: { id: incident.id } })).toMatchObject({
    id: incident.id, description: 'Archived incident description', locationNote: null, status: 'OPEN', type: 'OTHER', severity: 'LOW' });
  expect((await rawDb.incidentFollowUp.findUniqueOrThrow({ where: { id: followUp.id } })).note).toBe('Archived incident follow-up');
  expect(await rawDb.lostFoundItem.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ holderNote: null, itemLabel: 'Operational bag label' });
  expect((await rawDb.shiftSwapRequest.findUniqueOrThrow({ where: { id: swap.id } })).reason).toBeNull();
  expect(await rawDb.eventMembership.count({ where: { eventId, lastSeenAt: { not: null } } })).toBe(0);
  expect(await rawDb.person.findUniqueOrThrow({ where: { id: person.id } })).toMatchObject({ email: person.email, piiErasedAt: null });
  expect((await rawDb.incident.findUniqueOrThrow({ where: { id: foreign.id } })).description).toBe('Current event text');
  expect(await rawDb.incident.count({ where: { eventId } })).toBe(1);
  expect(await rawDb.incidentFollowUp.count({ where: { eventId } })).toBe(1);
});
