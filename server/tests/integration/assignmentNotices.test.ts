import { beforeEach, expect, it } from 'vitest';
import { createAssignment } from '../../src/modules/assignments/application/createAssignment.js';
import { deleteAssignment } from '../../src/modules/assignments/application/deleteAssignment.js';
import { applyRosterImport } from '../../src/modules/roster/application/applyRosterImport.js';
import { recordRosterImport } from '../../src/modules/roster/data/importMetadataRepo.js';
import { prisma } from '../../src/platform/db/client.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../src/platform/http/auditContext.js';
import { fixedClock } from '../../src/platform/time/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { createEventDayToday, createStation, createVolunteer, shiftOn, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

beforeEach(resetDatabase);
it('notifies actual add/move/remove changes only, including a removed row, and suppresses a no-op roster import', async () => {
  const scope = await testEvent();
  const admin = await createVolunteer({ email: 'assignment-author@example.test', role: 'ADMIN' });
  const person = await createVolunteer({ email: 'assignment-recipient@example.test', role: 'VOLUNTEER' });
  const member = await rawDb.eventMembership.findFirstOrThrow({ where: { eventId: scope.eventId, personId: admin.id } });
  const day = await createEventDayToday(); const shiftId = await shiftOn(day.id);
  const first = await createStation({ code: 'ASSIGNMENT-FIRST' }); const next = await createStation({ code: 'ASSIGNMENT-NEXT' });
  const actor = { scope, volunteerId: admin.id, membershipId: member.id, clock: fixedClock(FROZEN_NOW),
    audit: { ...SYSTEM_AUDIT_CONTEXT, eventId: scope.eventId, actorId: admin.id, actorSub: admin.sub, membershipId: member.id } };
  const input = { volunteerId: person.id, stationId: first.id, shiftId, roleLabel: 'Counter' };
  const assignment = await createAssignment(input, actor);
  await createAssignment(input, actor);
  expect(await rawDb.notice.count()).toBe(1);
  await prisma.$transaction((tx) => applyRosterImport(tx, { people: [{ row: { email: person.email, displayName: 'Recipient', role: 'VOLUNTEER' }, created: false, roleChangedFrom: null }],
    links: [], assignments: [{ email: person.email, stationId: first.id, eventDayId: day.id, shiftId, roleLabel: 'Counter', created: false }], issues: [],
    counters: { volunteersCreated: 0, volunteersUpdated: 1, assignmentsCreated: 0, assignmentsUpdated: 1 } },
  { identities: new Map([[person.email, person.sub]]), scope, audit: actor.audit, clock: actor.clock }));
  expect(await rawDb.notice.count()).toBe(1);
  await createAssignment({ ...input, stationId: next.id }, actor);
  await deleteAssignment(assignment.id, actor);
  expect(await rawDb.shiftAssignment.findUnique({ where: { id: assignment.id } })).toBeNull();
  const notices = await rawDb.notice.findMany({ where: { recipientPersonId: person.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  expect(notices).toHaveLength(3);
  expect(notices.map((row) => (row.context as { operation: string }).operation).sort()).toEqual(['ADDED', 'MOVED', 'REMOVED']);
  expect(new Set(notices.map((row) => row.transitionKey)).size).toBe(3);
  expect(JSON.stringify(notices)).not.toMatch(/Recipient|assignment-recipient@example/);
});
it('records metadata-only roster import ownership and exact rehearsal mode without promising capture undo', async () => {
  const scope = await testEvent(); const person = await createVolunteer({ email: 'roster-meta@example.test', role: 'ADMIN' });
  await rawDb.event.update({ where: { id: scope.eventId }, data: { status: 'REHEARSAL' } });
  const batch = await prisma.$transaction((tx) => recordRosterImport(tx, scope, { importedById: person.id, rowCount: 17, now: FROZEN_NOW }));
  expect(await rawDb.importBatch.findUnique({ where: { id: batch.id } })).toMatchObject({ targetTable: 'Roster', source: 'APP',
    rowCount: 17, importedById: person.id, rehearsal: true, importedAt: FROZEN_NOW, provenanceVersion: 0,
    fallbackWindowId: null, fileName: null, notes: null, undoneAt: null });
  expect(await rawDb.registration.count({ where: { importBatchId: batch.id } })).toBe(0);
  expect(await rawDb.footfallTick.count({ where: { importBatchId: batch.id } })).toBe(0);
});
