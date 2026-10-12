import { afterEach, beforeEach, expect, it } from 'vitest';
import { EntityResponse, RecordsResponse } from '@spoh/shared';
import { stationWorkspaceSource } from '../../src/modules/station/index.js';
import { peopleWorkspaceSource } from '../../src/modules/people/index.js';
import { structureWorkspaceSource } from '../../src/modules/structure/index.js';
import { assignmentWorkspaceSource } from '../../src/modules/assignments/index.js';
import { lostFoundWorkspaceSource } from '../../src/modules/lostFound/index.js';
import { auditWorkspaceSource } from '../../src/modules/audit/index.js';
import { getStaffingGaps } from '../../src/modules/shift/index.js';
import { createReadContext } from '../../src/platform/access/currentRead.js';
import { useAuthorizer } from '../../src/platform/access/engine.js';
import { prisma } from '../../src/platform/db/client.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { assignToStation, createEventDayOn, createEventDayToday, createStation, createVolunteer,
  shiftOn, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

let eventId: string;
let admin: TestVolunteer;
let ic: TestVolunteer;
let colleague: TestVolunteer;
let firstStation: string;
let secondStation: string;
let dayId: string;
let ownAssignment: string;
let otherAssignment: string;
const member = (personId: string) => rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId } });
async function reader(person: TestVolunteer) {
  return createReadContext({ scope: { eventId }, personId: person.id, membershipId: (await member(person.id)).id, now: FROZEN_NOW, db: prisma });
}
beforeEach(async () => {
  useAuthorizer(null);
  await resetDatabase();
  eventId = (await testEvent()).eventId;
  admin = await createVolunteer({ email: 'workspace-admin@example.test', role: 'ADMIN', displayName: 'Admin' });
  ic = await createVolunteer({ email: 'workspace-ic@example.test', role: 'IC', displayName: 'IC' });
  colleague = await createVolunteer({ email: 'workspace-colleague@example.test', role: 'VOLUNTEER', displayName: 'Colleague' });
  firstStation = (await createStation({ code: 'FIRST', countsEntry: true })).id;
  secondStation = (await createStation({ code: 'SECOND', countsEntry: true })).id;
  dayId = (await createEventDayToday()).id;
  ownAssignment = (await assignToStation({ volunteerId: ic.id, stationId: firstStation, eventDayId: dayId })).id;
  otherAssignment = (await assignToStation({ volunteerId: colleague.id, stationId: secondStation, eventDayId: dayId })).id;
});
afterEach(() => useAuthorizer(null));

it('uses real Cedar to keep foreign-station counts visible without a named roster or person reference', async () => {
  const context = await reader(ic);
  const station = EntityResponse.parse(await stationWorkspaceSource.entity(context, { kind: 'station', id: secondStation }));
  expect(station.related.some((link) => link.destination.type === 'records' && link.destination.filter.kind === 'registrations')).toBe(true);
  expect(station.related.some((link) => link.destination.type === 'records' && link.destination.filter.kind === 'assignments')).toBe(false);
  expect(station.related).toEqual(expect.arrayContaining(['registrations', 'footfall'].map((kind) => expect.objectContaining({
    destination: { type: 'records', filter: { kind, stationId: secondStation, source: 'APP', asOf: FROZEN_NOW.toISOString() } },
  }))));
  await expect(assignmentWorkspaceSource.entity(context, { kind: 'assignment', id: otherAssignment })).rejects.toMatchObject({ statusCode: 403 });
  await expect(peopleWorkspaceSource.entity(context, { kind: 'person', id: colleague.id,
    via: { kind: 'assignment', assignmentId: otherAssignment } })).rejects.toMatchObject({ statusCode: 403 });
  await expect(peopleWorkspaceSource.entity(context, { kind: 'person', id: colleague.id,
    via: { kind: 'assignment', assignmentId: ownAssignment } })).rejects.toMatchObject({ statusCode: 404 });
});

it('offers station audit history with Audit.Read and own assignment swaps with their actual assignment authority', async () => {
  const adminStation = EntityResponse.parse(await stationWorkspaceSource.entity(await reader(admin), { kind: 'station', id: firstStation }));
  expect(adminStation.related).toContainEqual(expect.objectContaining({ destination: { type: 'records',
    filter: { kind: 'audit', entityType: 'Station', entityId: firstStation } } }));
  const own = EntityResponse.parse(await assignmentWorkspaceSource.entity(await reader(ic), { kind: 'assignment', id: ownAssignment }));
  expect(own.actions).toContainEqual({ label: 'Request a swap', destination: { type: 'action', path: '/swaps' } });
  const repair = EntityResponse.parse(await assignmentWorkspaceSource.entity(await reader(admin), { kind: 'assignment', id: ownAssignment }));
  expect(repair.actions).toContainEqual({ label: 'Repair assignment', destination: { type: 'action', path: '/admin/staffing' } });
});

it('shows limited colleague references only for the persisted allowed station context and never full contact fields', async () => {
  const second = await createVolunteer({ email: 'workspace-second@example.test', role: 'VOLUNTEER', displayName: 'Second' });
  const related = await assignToStation({ volunteerId: second.id, stationId: firstStation, eventDayId: dayId });
  const context = await reader(ic);
  const person = EntityResponse.parse(await peopleWorkspaceSource.entity(context, { kind: 'person', id: second.id,
    via: { kind: 'assignment', assignmentId: related.id } }));
  expect(person.title).toBe('Second');
  expect(person.fields.map((field) => field.label)).toEqual(['Event membership']);
  const shiftId = await shiftOn(dayId);
  expect(EntityResponse.parse(await structureWorkspaceSource.entity(context, { kind: 'shift', id: shiftId,
    via: { kind: 'assignment', assignmentId: related.id } })).title).toBe('Morning');
});

it('binds caller standing to the authenticated person and refuses a borrowed membership', async () => {
  const borrowed = createReadContext({ scope: { eventId }, personId: colleague.id, membershipId: (await member(admin.id)).id,
    now: FROZEN_NOW, db: prisma });
  await expect(peopleWorkspaceSource.entity(borrowed, { kind: 'person', id: admin.id })).rejects.toMatchObject({ statusCode: 403 });
  await expect(stationWorkspaceSource.entity(borrowed, { kind: 'station', id: firstStation })).rejects.toMatchObject({ statusCode: 403 });
});

it('enforces the supplied assignment identity even when the reader has full people or structure authority', async () => {
  const context = await reader(admin);
  const via = { kind: 'assignment' as const, assignmentId: ownAssignment };
  await expect(peopleWorkspaceSource.entity(context, { kind: 'person', id: colleague.id, via }))
    .rejects.toMatchObject({ statusCode: 404 });
  await expect(structureWorkspaceSource.entity(context, { kind: 'shift', id: await shiftOn(dayId, 'AFTERNOON'), via }))
    .rejects.toMatchObject({ statusCode: 404 });
  await expect(structureWorkspaceSource.entity(context, { kind: 'event-day', id: (await createEventDayOn('2027-01-08')).id, via }))
    .rejects.toMatchObject({ statusCode: 404 });
});

it('keeps full people, ordinary assignments and days aggregates equal to their exact filtered dataset across pages', async () => {
  const context = await reader(admin);
  const people = RecordsResponse.parse(await peopleWorkspaceSource.records!(context, { filter: { kind: 'people', status: 'ACTIVE' }, limit: 1 }));
  expect(people.aggregate).toEqual({ value: 3, unit: 'people' });
  expect(people.meta.count).toBe(3);
  expect(people.data).toHaveLength(1);
  const next = RecordsResponse.parse(await peopleWorkspaceSource.records!(context,
    { filter: { kind: 'people', status: 'ACTIVE' }, limit: 1, cursor: people.meta.nextCursor! }));
  expect(next.data[0]?.id).not.toBe(people.data[0]?.id);
  await expect(peopleWorkspaceSource.records!(context, { filter: { kind: 'people', personId: colleague.id }, limit: 1, cursor: admin.id }))
    .rejects.toMatchObject({ statusCode: 404 });
  const assignments = RecordsResponse.parse(await assignmentWorkspaceSource.records!(context,
    { filter: { kind: 'assignments', stationId: firstStation, running: true }, limit: 1 }));
  expect(assignments.aggregate).toEqual({ value: 1, unit: 'assignments' });
  await expect(assignmentWorkspaceSource.records!(context, { filter: { kind: 'assignments', stationId: firstStation },
    limit: 1, cursor: otherAssignment })).rejects.toMatchObject({ statusCode: 404 });
  const days = RecordsResponse.parse(await structureWorkspaceSource.records!(context, { filter: { kind: 'days', eventDayId: dayId }, limit: 1 }));
  expect(days.aggregate).toEqual({ value: 1, unit: 'days' });
  const afterDay = RecordsResponse.parse(await structureWorkspaceSource.records!(context,
    { filter: { kind: 'days', eventDayId: dayId }, limit: 1, cursor: dayId }));
  expect(afterDay.meta.count).toBe(1); expect(afterDay.data).toEqual([]);
  const excludedDay = await createEventDayOn('2027-01-08');
  await expect(structureWorkspaceSource.records!(context,
    { filter: { kind: 'days', eventDayId: dayId }, limit: 1, cursor: excludedDay.id }))
    .rejects.toMatchObject({ statusCode: 404 });
});

it('reproduces the dashboard gaps by materialized shift ID even when one template runs on overlapping days', async () => {
  await rawDb.shiftAssignment.update({ where: { id: otherAssignment }, data: { checkedInAt: FROZEN_NOW } });
  const secondDay = await createEventDayOn('2027-01-08', 'Second day');
  await rawDb.shift.update({ where: { id: await shiftOn(secondDay.id) }, data: {
    startsAt: new Date(FROZEN_NOW.getTime() - 60_000), endsAt: new Date(FROZEN_NOW.getTime() + 60_000) } });
  const source = await getStaffingGaps({ eventId }, FROZEN_NOW);
  const records = RecordsResponse.parse(await assignmentWorkspaceSource.records!(await reader(admin),
    { filter: { kind: 'assignments', coverageGap: true, asOf: FROZEN_NOW.toISOString() }, limit: 50 }));
  expect(records.aggregate).toMatchObject({ value: source.gaps.length, unit: 'coverageSlots' });
  expect(source.gaps).toHaveLength(3);
  expect(new Set(records.data.map((row) => row.id)).size).toBe(3);
});

it('keeps found-item pool/status/time filters exact and never exposes its private photo key', async () => {
  const logger = await member(colleague.id);
  const item = await rawDb.lostFoundItem.create({ data: { eventId, itemLabel: 'Bottle', foundStationId: firstStation,
    foundAt: FROZEN_NOW, loggedById: colleague.id, loggedByMembershipId: logger.id, photoKey: 'synthetic/private/object.png' } });
  await rawDb.lostFoundItem.create({ data: { eventId, itemLabel: 'Practice bottle', foundAt: FROZEN_NOW,
    loggedById: colleague.id, loggedByMembershipId: logger.id, rehearsal: true } });
  const context = await reader(admin);
  const records = RecordsResponse.parse(await lostFoundWorkspaceSource.records!(context,
    { filter: { kind: 'lost-found', stationId: firstStation, status: 'HELD', rehearsal: false, asOf: FROZEN_NOW.toISOString() }, limit: 50 }));
  expect(records.aggregate.value).toBe(1);
  expect(JSON.stringify(records)).not.toContain('synthetic/private/object.png');
  await expect(lostFoundWorkspaceSource.records!(context, { filter: { kind: 'lost-found', rehearsal: true }, limit: 10, cursor: item.id }))
    .rejects.toMatchObject({ statusCode: 404 });
});

it('excludes global/foreign audit rows and raw before/after or transport fields from generic history', async () => {
  const row = await rawDb.auditLog.create({ data: { eventId, actorId: admin.id, membershipId: (await member(admin.id)).id,
    action: 'registration.void', entityType: 'Registration', entityId: 'erased-row',
    before: { privateContact: 'private-contact' }, after: { privateContact: 'private-after' }, ip: 'private-ip', actorSub: 'private-sub' } });
  const global = await rawDb.auditLog.create({ data: { action: 'registration.void', entityType: 'Registration', entityId: 'global-row' } });
  const context = await reader(admin);
  const records = RecordsResponse.parse(await auditWorkspaceSource.records!(context, { filter: { kind: 'audit', action: 'registration.void' }, limit: 50 }));
  expect(records.aggregate.value).toBe(1);
  expect(records.data[0]?.id).toBe(row.id);
  expect(JSON.stringify(records)).not.toMatch(/private-contact|private-after|private-ip|private-sub/);
  expect(await auditWorkspaceSource.entity(context, { kind: 'audit', id: global.id })).toBeNull();
  await expect(auditWorkspaceSource.records!(context, { filter: { kind: 'audit', action: 'registration.void' }, limit: 5, cursor: global.id }))
    .rejects.toMatchObject({ statusCode: 404 });
});

it('rechecks current deactivation on every source request', async () => {
  const context = await reader(admin);
  await rawDb.eventMembership.update({ where: { id: (await member(admin.id)).id }, data: { status: 'DEACTIVATED' } });
  await expect(peopleWorkspaceSource.records!(context, { filter: { kind: 'people' }, limit: 10 })).rejects.toMatchObject({ statusCode: 403 });
  await expect(auditWorkspaceSource.records!(context, { filter: { kind: 'audit' }, limit: 10 })).rejects.toMatchObject({ statusCode: 403 });
});

it('does not substitute stored role grants when every existing roster resource is denied by current Cedar', async () => {
  await rawDb.shiftAssignment.delete({ where: { id: ownAssignment } });
  await expect(assignmentWorkspaceSource.records!(await reader(ic), { filter: { kind: 'assignments' }, limit: 10 }))
    .rejects.toMatchObject({ statusCode: 403 });
});

it('refuses future ordinary and aggregate assignment observations', async () => {
  const context = await reader(admin);
  const asOf = new Date(FROZEN_NOW.getTime() + 1).toISOString();
  for (const filter of [{ kind: 'assignments' as const, asOf }, { kind: 'assignments' as const, coverageGap: true, asOf }]) {
    await expect(assignmentWorkspaceSource.records!(context, { filter, limit: 10 })).rejects.toMatchObject({ statusCode: 400 });
  }
});
