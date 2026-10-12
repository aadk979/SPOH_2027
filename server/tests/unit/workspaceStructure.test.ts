import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaTransactionClient } from '../../src/platform/db/client.js';
import type { ReadContext } from '../../src/platform/access/currentRead.js';
import { ServiceUnavailableError } from '../../src/platform/errors/index.js';

const repos = vi.hoisted(() => ({
  stationReference: vi.fn(), searchStationReferences: vi.fn(),
  ownPersonReference: vi.fn(), personProfile: vi.fn(), personViaAssignment: vi.fn(), personViaAssignmentProof: vi.fn(),
  countWorkspacePeople: vi.fn(), peopleCursor: vi.fn(), searchWorkspacePeople: vi.fn(), workspacePeoplePage: vi.fn(),
  countWorkspaceDays: vi.fn(), searchWorkspaceDays: vi.fn(), searchWorkspaceShifts: vi.fn(), workspaceDay: vi.fn(),
  structureAssignmentProof: vi.fn(), workspaceDayShifts: vi.fn(), workspaceDaysCursor: vi.fn(), workspaceDaysPage: vi.fn(), workspaceShift: vi.fn(),
  assignmentCursor: vi.fn(), countWorkspaceAssignments: vi.fn(), searchWorkspaceAssignments: vi.fn(), workspaceAssignment: vi.fn(),
  workspaceAssignmentPage: vi.fn(), workspaceAssignmentProof: vi.fn(), coverageAssigned: vi.fn(), coverageCheckedIn: vi.fn(),
  coverageShifts: vi.fn(), coverageStations: vi.fn(),
}));
vi.mock('../../src/modules/station/data/workspaceRepo.js', () => repos);
vi.mock('../../src/modules/people/data/workspaceRepo.js', () => repos);
vi.mock('../../src/modules/structure/data/workspaceRepo.js', () => repos);
vi.mock('../../src/modules/assignments/data/workspaceRepo.js', () => repos);
import { stationWorkspaceSource } from '../../src/modules/station/application/workspace.js';
import { peopleWorkspaceSource } from '../../src/modules/people/application/workspace.js';
import { structureWorkspaceSource } from '../../src/modules/structure/application/workspace.js';
import { assignmentWorkspaceSource } from '../../src/modules/assignments/application/workspace.js';

const now = new Date('2028-05-12T10:00:00.000Z');
function context(actions: string[] = ['Self.Read']): ReadContext {
  return { scope: { eventId: 'event' }, personId: 'reader', membershipId: 'reader-member', now,
    db: { station: { findMany: vi.fn(async () => [{ id: 'station' }, { id: 'foreign-station' }]),
      findFirst: vi.fn(async () => ({ id: 'station' })) } } as unknown as PrismaTransactionClient,
    canRead: vi.fn(async (question) => actions.includes(question.action)) };
}
const proof = { id: 'assignment', volunteerId: 'colleague', membershipId: 'colleague-member',
  stationId: 'station', shiftId: 'shift', eventDayId: 'day' };
const day = { id: 'day', date: new Date('2028-05-12'), label: 'Open day', isPublicDay: true, isTourDay: false };
const assignment = { ...proof, roleLabel: 'Counter', checkedInAt: now, checkedOutAt: null,
  volunteer: { displayName: 'Colleague' }, station: { name: 'Room' }, eventDay: { ...day },
  shift: { startsAt: new Date('2028-05-12T09:00:00Z'), endsAt: new Date('2028-05-12T12:00:00Z'), template: { code: 'MORNING', label: 'Morning' } } };

beforeEach(() => { vi.resetAllMocks(); repos.workspaceDayShifts.mockResolvedValue([]); });
describe('source-owned workspace authority and bounded projections', () => {
  it('refuses station data before fetching it when caller standing is denied', async () => {
    await expect(stationWorkspaceSource.entity(context([]), { kind: 'station', id: 'station' })).rejects.toMatchObject({ statusCode: 403 });
    expect(repos.stationReference).not.toHaveBeenCalled();
  });
  it('shows permitted counts without adding denied named-roster or configuration destinations', async () => {
    repos.stationReference.mockResolvedValue({ id: 'station', code: 'R', name: 'Room', floor: null, active: true });
    const result = await stationWorkspaceSource.entity(context(['Self.Read', 'Dashboard.ReadStation']), { kind: 'station', id: 'station' });
    expect(result?.related.some((link) => link.destination.type === 'records' && link.destination.filter.kind === 'registrations')).toBe(true);
    expect(result?.related.some((link) => link.destination.type === 'records' && link.destination.filter.kind === 'assignments')).toBe(false);
    expect(result?.actions).toEqual([]);
    expect(repos.stationReference).toHaveBeenCalledWith({ eventId: 'event' }, expect.anything(), 'station');
  });
  it('propagates policy unavailability before fetching a private profile', async () => {
    const reader = context();
    reader.canRead = vi.fn(async () => { throw new ServiceUnavailableError('Permissions unavailable'); });
    await expect(peopleWorkspaceSource.entity(reader, { kind: 'person', id: 'colleague' })).rejects.toMatchObject({ statusCode: 503 });
    expect(repos.personProfile).not.toHaveBeenCalled();
    expect(repos.personViaAssignment).not.toHaveBeenCalled();
  });
  it('rejects a forged colleague assignment context without loading names or contacts', async () => {
    repos.personViaAssignmentProof.mockResolvedValue(null);
    await expect(peopleWorkspaceSource.entity(context(), { kind: 'person', id: 'colleague',
      via: { kind: 'assignment', assignmentId: 'unrelated' } })).rejects.toMatchObject({ statusCode: 404 });
    expect(repos.personViaAssignment).not.toHaveBeenCalled();
  });
  it('checks the real station roster before loading a colleague reference', async () => {
    repos.personViaAssignmentProof.mockResolvedValue(proof);
    await expect(peopleWorkspaceSource.entity(context(), { kind: 'person', id: 'colleague',
      via: { kind: 'assignment', assignmentId: 'assignment' } })).rejects.toMatchObject({ statusCode: 403 });
    expect(repos.personViaAssignment).not.toHaveBeenCalled();
  });
  it('retains the persisted assignment in the final limited reference and excludes contact details', async () => {
    repos.personViaAssignmentProof.mockResolvedValue(proof);
    repos.personViaAssignment.mockResolvedValue({ id: 'colleague-member', personId: 'colleague', person: { displayName: 'Colleague' } });
    const result = await peopleWorkspaceSource.entity(context(['Self.Read', 'Roster.ReadStation']),
      { kind: 'person', id: 'colleague', via: { kind: 'assignment', assignmentId: 'assignment' } });
    expect(result?.fields).toEqual([{ label: 'Event membership', value: 'colleague-member', format: 'text' }]);
    expect(repos.personViaAssignment).toHaveBeenCalledWith({ eventId: 'event' }, expect.anything(),
      { assignmentId: 'assignment', personId: 'colleague', stationId: 'station' });
    expect(repos.personProfile).not.toHaveBeenCalled();
  });
  it('returns no reference if the assignment moves during its permission check', async () => {
    repos.personViaAssignmentProof.mockResolvedValue(proof);
    repos.personViaAssignment.mockResolvedValue(null);
    expect(await peopleWorkspaceSource.entity(context(['Self.Read', 'Roster.ReadStation']),
      { kind: 'person', id: 'colleague', via: { kind: 'assignment', assignmentId: 'assignment' } })).toBeNull();
  });
  it('binds an own-person reference to the caller membership rather than another event membership', async () => {
    repos.ownPersonReference.mockResolvedValue({ id: 'reader-member', personId: 'reader', person: { displayName: 'Reader' } });
    await peopleWorkspaceSource.entity(context(), { kind: 'person', id: 'reader' });
    expect(repos.ownPersonReference).toHaveBeenCalledWith({ eventId: 'event' }, expect.anything(),
      { personId: 'reader', membershipId: 'reader-member' });
  });
  it('does not allow a supplied assignment to unlock a different materialized shift', async () => {
    repos.structureAssignmentProof.mockResolvedValue(proof);
    await expect(structureWorkspaceSource.entity(context(['Self.Read', 'Roster.ReadStation']),
      { kind: 'shift', id: 'other-shift', via: { kind: 'assignment', assignmentId: 'assignment' } })).rejects.toMatchObject({ statusCode: 404 });
    expect(repos.workspaceShift).not.toHaveBeenCalled();
  });
  it('limits an own day to persisted caller assignments before loading configuration', async () => {
    repos.workspaceDay.mockResolvedValue(day);
    await structureWorkspaceSource.entity(context(), { kind: 'event-day', id: 'day' });
    expect(repos.workspaceDay).toHaveBeenCalledWith({ eventId: 'event' }, expect.anything(),
      { id: 'day', own: { personId: 'reader', membershipId: 'reader-member' } });
  });
  it('denies private assignment names before querying its body', async () => {
    repos.workspaceAssignmentProof.mockResolvedValue(proof);
    await expect(assignmentWorkspaceSource.entity(context(), { kind: 'assignment', id: 'assignment' })).rejects.toMatchObject({ statusCode: 403 });
    expect(repos.workspaceAssignment).not.toHaveBeenCalled();
  });
  it('uses the resolved full relation in assignment body reads and preserves colleague link context', async () => {
    repos.workspaceAssignmentProof.mockResolvedValue(proof);
    repos.workspaceAssignment.mockResolvedValue(assignment);
    const result = await assignmentWorkspaceSource.entity(context(['Self.Read', 'Roster.ReadStation']), { kind: 'assignment', id: 'assignment' });
    expect(repos.workspaceAssignment).toHaveBeenCalledWith({ eventId: 'event' }, expect.anything(), { proof });
    expect(result?.related.find((link) => link.label === 'Shift')?.destination).toEqual({ type: 'entity',
      target: { kind: 'shift', id: 'shift', via: { kind: 'assignment', assignmentId: 'assignment' } } });
    expect(JSON.stringify(result)).not.toMatch(/phone|email|cognito|device/i);
  });
});

describe('filtered records and exact materialized coverage', () => {
  it.each(['people', 'days'] as const)('refuses a %s cursor outside its exact authorized dataset before counts', async (kind) => {
    repos.peopleCursor.mockResolvedValue(null);
    repos.workspaceDaysCursor.mockResolvedValue(null);
    const source = kind === 'people' ? peopleWorkspaceSource : structureWorkspaceSource;
    await expect(source.records!(context(['People.Read', 'Structure.Read']), { filter: { kind }, limit: 10, cursor: 'foreign' }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(repos.countWorkspacePeople).not.toHaveBeenCalled();
    expect(repos.countWorkspaceDays).not.toHaveBeenCalled();
  });
  it('preserves ordinary assignment filters and full count across a bounded page', async () => {
    repos.assignmentCursor.mockResolvedValue({ id: 'anchor' });
    repos.countWorkspaceAssignments.mockResolvedValue(7);
    repos.workspaceAssignmentPage.mockResolvedValue([assignment, { ...assignment, id: 'next' }]);
    const filter = { kind: 'assignments' as const, stationId: 'station', eventDayId: 'day', shiftId: 'shift', running: true,
      checkedIn: true, checkedOut: false, asOf: now.toISOString() };
    const result = await assignmentWorkspaceSource.records!(context(['Roster.ReadStation']), { filter, limit: 1, cursor: 'anchor' });
    expect(result.aggregate).toEqual({ value: 7, unit: 'assignments' });
    expect(result.meta).toEqual({ count: 7, nextCursor: 'assignment' });
    expect(repos.assignmentCursor.mock.calls[0]?.[2]).toMatchObject({ filter, stationIds: ['station'], cursor: 'anchor' });
    expect(repos.countWorkspaceAssignments.mock.calls[0]?.[2]).toMatchObject({ filter, stationIds: ['station'] });
  });
  it('keeps overlapping shifts with the same code as distinct coverage slots and never fetches private roster bodies', async () => {
    repos.coverageStations.mockResolvedValue([{ id: 'station', name: 'Room' }]);
    repos.coverageShifts.mockResolvedValue([{ id: 'shift-a', eventDayId: 'day-a', template: { code: 'AM', label: 'AM' } },
      { id: 'shift-b', eventDayId: 'day-b', template: { code: 'AM', label: 'AM' } }]);
    repos.coverageAssigned.mockResolvedValue([{ stationId: 'station', shiftId: 'shift-a', _count: { id: 2 } }]);
    repos.coverageCheckedIn.mockResolvedValue([{ stationId: 'station', shiftId: 'shift-a', _count: { id: 1 } }]);
    const result = await assignmentWorkspaceSource.records!(context(['Dashboard.ReadStation']),
      { filter: { kind: 'assignments', coverageGap: true, stationId: 'station', asOf: now.toISOString() }, limit: 50 });
    expect(result.aggregate).toMatchObject({ value: 2, unit: 'coverageSlots' });
    expect(new Set(result.data.map((row) => row.id)).size).toBe(2);
    expect(result.data.every((row) => row.related.length === 0)).toBe(true);
    expect(repos.workspaceAssignmentPage).not.toHaveBeenCalled();
    expect(repos.workspaceAssignment).not.toHaveBeenCalled();
  });
  it('refuses coverage cursors from a different station or observation instead of continuing another list', async () => {
    repos.coverageStations.mockResolvedValue([]);
    repos.coverageShifts.mockResolvedValue([]);
    repos.coverageAssigned.mockResolvedValue([]);
    repos.coverageCheckedIn.mockResolvedValue([]);
    await expect(assignmentWorkspaceSource.records!(context(['Dashboard.ReadStation']),
      { filter: { kind: 'assignments', coverageGap: true, stationId: 'station' }, limit: 5, cursor: 'old-cell' }))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});
