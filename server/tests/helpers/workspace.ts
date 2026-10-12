import { createReadContext } from '../../src/platform/access/currentRead.js';
import { prisma } from '../../src/platform/db/client.js';
import { useAuthorizer } from '../../src/platform/access/engine.js';
import { rawDb, resetDatabase } from './db.js';
import { assignToStation, createEventDayToday, createStation, createVolunteer,
  membershipOf, testEvent, type TestVolunteer } from './fixtures.js';
import { FROZEN_NOW } from '../setup.js';

/** Real Cedar principals and scoped materialized assignments, shared by workspace source tests. */
export async function workspaceFixture() {
  useAuthorizer(null);
  await resetDatabase();
  const scope = await testEvent();
  const admin = await createVolunteer({ email: 'sources-admin@example.test', role: 'ADMIN' });
  const ic = await createVolunteer({ email: 'sources-ic@example.test', role: 'IC' });
  const volunteer = await createVolunteer({ email: 'sources-volunteer@example.test', role: 'VOLUNTEER' });
  const first = (await createStation({ code: 'SOURCE_FIRST', countsEntry: true, issuesStamp: true })).id;
  const second = (await createStation({ code: 'SOURCE_SECOND', countsEntry: true, issuesStamp: true })).id;
  const dayId = (await createEventDayToday()).id;
  await assignToStation({ volunteerId: ic.id, stationId: first, eventDayId: dayId });
  await assignToStation({ volunteerId: volunteer.id, stationId: second, eventDayId: dayId });
  const category = await rawDb.captureCategory.findFirstOrThrow({ where: { eventId: scope.eventId, code: 'SEC_4' } });
  const recorder = await membershipOf(volunteer.id);
  async function reader(person: TestVolunteer) {
    return createReadContext({ scope, personId: person.id, membershipId: (await membershipOf(person.id)).id,
      now: FROZEN_NOW, db: prisma });
  }
  return { scope, eventId: scope.eventId, admin, ic, volunteer, first, second, dayId, category, recorder, reader };
}

export type WorkspaceFixture = Awaited<ReturnType<typeof workspaceFixture>>;
export const SOURCE_BEFORE = new Date(FROZEN_NOW.getTime() - 60_000);
export const SOURCE_FUTURE = new Date(FROZEN_NOW.getTime() + 1);
