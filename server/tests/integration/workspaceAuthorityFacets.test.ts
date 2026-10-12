import { afterEach, beforeEach, expect, it } from 'vitest';
import { EntityResponse, RecordsResponse } from '@spoh/shared';
import { peopleWorkspaceSource } from '../../src/modules/people/index.js';
import { structureWorkspaceSource } from '../../src/modules/structure/index.js';
import { assignmentWorkspaceSource } from '../../src/modules/assignments/index.js';
import { useAuthorizer } from '../../src/platform/access/engine.js';
import { rawDb } from '../helpers/db.js';
import { assignToStation, createEventDayOn, createVolunteer, membershipOf, shiftOn } from '../helpers/fixtures.js';
import { SOURCE_BEFORE, SOURCE_FUTURE, workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
import { FROZEN_NOW } from '../setup.js';

let fixture: WorkspaceFixture;
beforeEach(async () => { fixture = await workspaceFixture(); });
afterEach(() => useAuthorizer(null));

async function ownAssignment() {
  return rawDb.shiftAssignment.findFirstOrThrow({ where: { eventId: fixture.eventId, volunteerId: fixture.volunteer.id } });
}

it('keeps an own person reference minimal with and without valid assignment provenance', async () => {
  await rawDb.person.update({ where: { id: fixture.volunteer.id }, data: { displayName: 'Synthetic volunteer' } });
  const context = await fixture.reader(fixture.volunteer);
  const assignment = await ownAssignment();
  for (const ref of [{ kind: 'person' as const, id: fixture.volunteer.id },
    { kind: 'person' as const, id: fixture.volunteer.id, via: { kind: 'assignment' as const, assignmentId: assignment.id } }]) {
    const person = EntityResponse.parse(await peopleWorkspaceSource.entity(context, ref));
    expect(person.fields.map((field) => field.label)).toEqual(['Event membership']);
    expect(person.facets).toContainEqual({ name: 'Full event profile', availability: 'denied' });
    expect(person.actions).toEqual([{ label: 'My attendance', destination: { type: 'action', path: '/attendance' } }]);
    expect(person.related).toContainEqual({ label: 'Assignments', destination: { type: 'records',
      filter: { kind: 'assignments', personId: fixture.volunteer.id } } });
    expect(JSON.stringify(person)).not.toMatch(/sources-volunteer@example|Phone|Raised incidents|registrations/);
  }
  const proved = EntityResponse.parse(await peopleWorkspaceSource.entity(context,
    { kind: 'person', id: fixture.volunteer.id, via: { kind: 'assignment', assignmentId: assignment.id } }));
  expect(proved.related).toContainEqual({ label: 'Proved assignment', destination: { type: 'entity',
    target: { kind: 'assignment', id: assignment.id } } });
  await expect(peopleWorkspaceSource.entity(context, { kind: 'person', id: fixture.volunteer.id,
    via: { kind: 'assignment', assignmentId: 'missing-assignment' } })).rejects.toMatchObject({ statusCode: 404 });
});

it('returns full current event profile and reporting links only with People.Read', async () => {
  const adminMember = await membershipOf(fixture.admin.id);
  await rawDb.eventMembership.update({ where: { id: fixture.recorder.id }, data: { reportsToId: adminMember.id } });
  await rawDb.person.update({ where: { id: fixture.volunteer.id }, data: { phone: 'synthetic-private-phone' } });
  const assignment = await ownAssignment();
  const context = await fixture.reader(fixture.admin);
  const person = EntityResponse.parse(await peopleWorkspaceSource.entity(context, { kind: 'person', id: fixture.volunteer.id,
    via: { kind: 'assignment', assignmentId: assignment.id } }));
  expect(person.fields).toContainEqual({ label: 'Phone', value: 'synthetic-private-phone', format: 'text' });
  expect(person.facets).toContainEqual({ name: 'Full event profile', availability: 'available' });
  expect(person.related).toContainEqual(expect.objectContaining({ destination: { type: 'entity', target: { kind: 'person', id: fixture.admin.id } } }));
  expect(person.related).toContainEqual({ label: 'Raised incidents', destination: { type: 'records',
    filter: { kind: 'incidents', personId: fixture.volunteer.id } } });
  for (const kind of ['registrations', 'footfall', 'stamps', 'redemptions']) {
    expect(person.related).toContainEqual({ label: kind, destination: { type: 'records', filter: { kind, personId: fixture.volunteer.id } } });
  }
  expect(person.actions).toEqual([{ label: 'Event person profile', destination: { type: 'action', path: '/admin/users/person',
    query: { id: fixture.volunteer.id } } }]);
  expect(await peopleWorkspaceSource.entity(context, { kind: 'person', id: 'missing-person' })).toBeNull();
  const self = EntityResponse.parse(await peopleWorkspaceSource.entity(context, { kind: 'person', id: fixture.admin.id }));
  expect(self.actions).toContainEqual({ label: 'My attendance', destination: { type: 'action', path: '/attendance' } });
});

it('searches current people through authorized assignments while keeping foreign colleagues absent', async () => {
  const colleague = await createVolunteer({ email: 'sources-colleague@example.test', role: 'VOLUNTEER' });
  const assignment = await assignToStation({ volunteerId: colleague.id, stationId: fixture.first, eventDayId: fixture.dayId });
  const input = { query: 'sources-', limit: 50 };
  const own = await peopleWorkspaceSource.search!(await fixture.reader(fixture.volunteer), input);
  expect(own.map((row) => row.destination.id)).toEqual([fixture.volunteer.id]);
  const permitted = await peopleWorkspaceSource.search!(await fixture.reader(fixture.ic), input);
  expect(permitted.map((row) => row.destination.id).sort()).toEqual([fixture.ic.id, colleague.id].sort());
  expect(permitted.find((row) => row.destination.id === colleague.id)?.destination).toEqual({ kind: 'person', id: colleague.id,
    via: { kind: 'assignment', assignmentId: assignment.id } });
  const full = await peopleWorkspaceSource.search!(await fixture.reader(fixture.admin), input);
  expect(full).toHaveLength(4);
  expect(full.every((row) => !row.destination.via)).toBe(true);
  const records = RecordsResponse.parse(await peopleWorkspaceSource.records!(await fixture.reader(fixture.admin),
    { filter: { kind: 'people', query: 'sources-colleague', personId: colleague.id, status: 'ACTIVE' }, limit: 1 }));
  expect(records.data.map((row) => row.id)).toEqual([colleague.id]);
  expect(records.meta).toMatchObject({ count: 1, nextCursor: null });
});

it('restricts own days and shifts to persisted assignments and offers only own attendance and roster links', async () => {
  const assignment = await ownAssignment();
  const context = await fixture.reader(fixture.volunteer);
  const via = { kind: 'assignment' as const, assignmentId: assignment.id };
  const day = EntityResponse.parse(await structureWorkspaceSource.entity(context, { kind: 'event-day', id: fixture.dayId, via }));
  expect(day.related).toEqual([{ label: 'Morning', destination: { type: 'entity', target: { kind: 'shift', id: assignment.shiftId } } },
    { label: 'My assignments', destination: { type: 'records', filter: { kind: 'assignments', eventDayId: fixture.dayId, personId: fixture.volunteer.id } } }]);
  expect(day.actions).toEqual([{ label: 'My attendance', destination: { type: 'action', path: '/attendance' } }]);
  const shift = EntityResponse.parse(await structureWorkspaceSource.entity(context, { kind: 'shift', id: assignment.shiftId, via }));
  expect(shift.related).toEqual([{ label: 'Event day', destination: { type: 'entity', target: { kind: 'event-day', id: fixture.dayId, via } } },
    { label: 'My assignment', destination: { type: 'records', filter: { kind: 'assignments', shiftId: assignment.shiftId, personId: fixture.volunteer.id } } }]);
  expect(shift.actions).toEqual([]);
  expect(await structureWorkspaceSource.entity(context, { kind: 'shift', id: await shiftOn(fixture.dayId, 'AFTERNOON') })).toBeNull();
  expect(await structureWorkspaceSource.entity(context, { kind: 'event-day', id: (await createEventDayOn('2027-01-08')).id })).toBeNull();
  const search = await structureWorkspaceSource.search!(context, { query: 'Morning', limit: 50 });
  expect(search.map((row) => row.destination)).toEqual([{ kind: 'shift', id: assignment.shiftId }]);
});

it('retains colleague day provenance and full-authority configuration links independently', async () => {
  const colleague = await createVolunteer({ email: 'proof-colleague@example.test', role: 'VOLUNTEER' });
  const assignment = await assignToStation({ volunteerId: colleague.id, stationId: fixture.first, eventDayId: fixture.dayId });
  const via = { kind: 'assignment' as const, assignmentId: assignment.id };
  await rawDb.rolePermission.deleteMany({ where: { eventId: fixture.eventId, role: 'IC', action: 'Structure.Read' } });
  const limitedContext = await fixture.reader(fixture.ic);
  expect(await limitedContext.canRead({ action: 'Structure.Read', resource: { type: 'Event', id: fixture.eventId } })).toBe(false);
  expect(await limitedContext.canRead({ action: 'Roster.ReadStation', resource: { type: 'Station', id: fixture.first } })).toBe(true);
  const limited = EntityResponse.parse(await structureWorkspaceSource.entity(limitedContext,
    { kind: 'event-day', id: fixture.dayId, via }));
  expect(limited.related).toEqual([{ label: 'Proved assignment', destination: { type: 'entity', target: { kind: 'assignment', id: assignment.id } } }]);
  expect(limited.actions).toEqual([]);
  const context = await fixture.reader(fixture.admin);
  const full = EntityResponse.parse(await structureWorkspaceSource.entity(context, { kind: 'event-day', id: fixture.dayId, via }));
  expect(full.actions).toEqual([{ label: 'Days and shift configuration', destination: { type: 'action', path: '/admin/days' } }]);
  for (const kind of ['registrations', 'footfall', 'cards', 'fallback']) {
    expect(full.related).toContainEqual({ label: kind, destination: { type: 'records', filter: { kind, date: '2027-01-07' } } });
  }
  expect(await structureWorkspaceSource.entity(context, { kind: 'event-day', id: 'missing-day' })).toBeNull();
  expect(await structureWorkspaceSource.entity(context, { kind: 'shift', id: 'missing-shift' })).toBeNull();
});

it('paginates assigned days without admitting unassigned days or mismatched date cursors', async () => {
  const tomorrow = await createEventDayOn('2027-01-08', 'Tomorrow');
  const unassigned = await createEventDayOn('2027-01-09', 'Unassigned day');
  await assignToStation({ volunteerId: fixture.volunteer.id, stationId: fixture.second, eventDayId: tomorrow.id });
  const context = await fixture.reader(fixture.volunteer);
  const first = RecordsResponse.parse(await structureWorkspaceSource.records!(context, { filter: { kind: 'days' }, limit: 1 }));
  expect(first.meta.count).toBe(2);
  expect(first.data.map((row) => row.id)).toEqual([fixture.dayId]);
  expect(first.meta.nextCursor).toBe(fixture.dayId);
  const next = RecordsResponse.parse(await structureWorkspaceSource.records!(context, { filter: { kind: 'days' }, limit: 1, cursor: fixture.dayId }));
  expect(next.data.map((row) => row.id)).toEqual([tomorrow.id]);
  expect(next.meta.nextCursor).toBeNull();
  for (const cursor of [unassigned.id, tomorrow.id]) {
    await expect(structureWorkspaceSource.records!(context,
      { filter: { kind: 'days', date: '2027-01-07', eventDayId: fixture.dayId }, limit: 1, cursor })).rejects.toMatchObject({ statusCode: 404 });
  }
  const search = await structureWorkspaceSource.search!(context, { query: 'day', limit: 50 });
  expect(search.some((row) => row.destination.id === unassigned.id)).toBe(false);
});

it('intersects assignment attendance predicates at asOf, rather than present database state', async () => {
  const assignment = await ownAssignment();
  const afternoon = await assignToStation({ volunteerId: fixture.volunteer.id, stationId: fixture.second,
    eventDayId: fixture.dayId, shift: 'AFTERNOON' });
  await rawDb.shiftAssignment.update({ where: { id: assignment.id }, data: { checkedInAt: SOURCE_BEFORE, checkedOutAt: SOURCE_FUTURE } });
  await rawDb.shiftAssignment.update({ where: { id: afternoon.id }, data: { checkedInAt: SOURCE_FUTURE, checkedOutAt: null } });
  const context = await fixture.reader(fixture.volunteer);
  const common = { kind: 'assignments' as const, personId: fixture.volunteer.id, stationId: fixture.second,
    eventDayId: fixture.dayId, date: '2027-01-07', asOf: FROZEN_NOW.toISOString() };
  const running = RecordsResponse.parse(await assignmentWorkspaceSource.records!(context,
    { filter: { ...common, shiftId: assignment.shiftId, running: true, checkedIn: true, checkedOut: false }, limit: 1 }));
  expect(running.data.map((row) => row.id)).toEqual([assignment.id]);
  expect(running.aggregate).toEqual({ value: 1, unit: 'assignments' });
  const future = RecordsResponse.parse(await assignmentWorkspaceSource.records!(context,
    { filter: { ...common, running: false, checkedIn: false, checkedOut: false }, limit: 1 }));
  expect(future.data.map((row) => row.id)).toEqual([afternoon.id]);
  const checkedOut = RecordsResponse.parse(await assignmentWorkspaceSource.records!(context,
    { filter: { ...common, checkedOut: true }, limit: 50 }));
  expect(checkedOut.meta.count).toBe(0);
  await rawDb.shiftAssignment.update({ where: { id: assignment.id }, data: { checkedOutAt: SOURCE_BEFORE } });
  const departed = RecordsResponse.parse(await assignmentWorkspaceSource.records!(context,
    { filter: { ...common, checkedOut: true }, limit: 50 }));
  expect(departed.data.map((row) => row.id)).toEqual([assignment.id]);
  await expect(assignmentWorkspaceSource.records!(context,
    { filter: { ...common, running: true }, limit: 1, cursor: afternoon.id })).rejects.toMatchObject({ statusCode: 404 });
});

it('paginates own assignments and searches only own or current authorized station relations', async () => {
  const own = await ownAssignment();
  const afternoon = await assignToStation({ volunteerId: fixture.volunteer.id, stationId: fixture.first,
    eventDayId: fixture.dayId, shift: 'AFTERNOON' });
  const context = await fixture.reader(fixture.volunteer);
  const filter = { kind: 'assignments' as const, personId: fixture.volunteer.id };
  const first = RecordsResponse.parse(await assignmentWorkspaceSource.records!(context, { filter, limit: 1 }));
  const next = RecordsResponse.parse(await assignmentWorkspaceSource.records!(context, { filter, limit: 1, cursor: first.meta.nextCursor! }));
  expect(first.meta.count).toBe(2);
  expect([first.data[0]?.id, next.data[0]?.id]).toEqual([own.id, afternoon.id]);
  const search = await assignmentWorkspaceSource.search!(context, { query: 'Volunteer', limit: 50 });
  expect(search.map((row) => row.destination.id).sort()).toEqual([own.id, afternoon.id].sort());
  const colleague = EntityResponse.parse(await assignmentWorkspaceSource.entity(await fixture.reader(fixture.ic),
    { kind: 'assignment', id: afternoon.id }));
  expect(colleague.actions).toEqual([]);
  expect(await assignmentWorkspaceSource.entity(context, { kind: 'assignment', id: 'missing-assignment' })).toBeNull();
});
