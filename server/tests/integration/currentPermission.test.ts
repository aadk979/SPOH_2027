import { beforeEach, describe, expect, it } from 'vitest';
import {
  requireCurrentPermission,
  type CurrentPermission,
} from '../../src/platform/access/currentPermission.js';
import { settingQuestion } from '../../src/platform/access/settingQuestion.js';
import { prisma } from '../../src/platform/db/client.js';
import { ForbiddenError } from '../../src/platform/errors/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  createVolunteer,
  deactivate,
  membershipOf,
  testEvent,
  type TestVolunteer,
} from '../helpers/fixtures.js';

/**
 * A use case's own recheck (P11.5 release 3): the policies decide from the transaction's
 * reads, with the event's grants, where the capability matrix used to.
 */
let eventId: string;

async function check(
  who: TestVolunteer,
  question: Pick<CurrentPermission, 'action' | 'resource'>,
): Promise<void> {
  const { id: membershipId } = await membershipOf(who.id);
  await prisma.$transaction((tx) =>
    requireCurrentPermission(tx, {
      scope: { eventId },
      membershipId,
      personId: who.id,
      ...question,
    }),
  );
}

/** An operational setting: `Settings.ManageEvent` on the setting itself. */
const manageCapture = settingQuestion('capture.open');

const changed = expect.objectContaining({
  message: 'Your event permission changed. Reload before trying again.',
});

beforeEach(async () => {
  await resetDatabase();
  ({ eventId } = await testEvent());
});

describe('requireCurrentPermission', () => {
  it('allows a role the event grants the action', async () => {
    const chief = await createVolunteer({ email: 'chief@current.test', role: 'CHIEF_COORDINATOR' });
    await expect(check(chief, manageCapture)).resolves.toBeUndefined();
  });

  it('refuses a role without the grant', async () => {
    const volunteer = await createVolunteer({ email: 'v@current.test', role: 'VOLUNTEER' });
    const refusal = check(volunteer, manageCapture);
    await expect(refusal).rejects.toBeInstanceOf(ForbiddenError);
    await expect(refusal).rejects.toEqual(changed);
  });

  it("follows the event's grants, not the capability matrix", async () => {
    const chief = await createVolunteer({
      email: 'chief2@current.test',
      role: 'CHIEF_COORDINATOR',
    });
    await rawDb.rolePermission.deleteMany({
      where: { eventId, role: 'CHIEF_COORDINATOR', action: 'Settings.ManageEvent' },
    });
    await expect(check(chief, manageCapture)).rejects.toEqual(changed);
  });

  it('refuses a deactivated member', async () => {
    const chief = await createVolunteer({
      email: 'chief3@current.test',
      role: 'CHIEF_COORDINATOR',
    });
    await deactivate({ id: chief.id });
    await expect(check(chief, { action: 'Settings.Read' })).rejects.toEqual(changed);
  });

  it('leaves a refusal by the archived guardrail alone to the use case', async () => {
    const chief = await createVolunteer({
      email: 'chief4@current.test',
      role: 'CHIEF_COORDINATOR',
    });
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
    await expect(check(chief, manageCapture)).resolves.toBeUndefined();
  });

  it("asks the member's own record for a self-service action", async () => {
    const volunteer = await createVolunteer({ email: 'v2@current.test', role: 'VOLUNTEER' });
    const { id } = await membershipOf(volunteer.id);
    await expect(
      check(volunteer, { action: 'Self.Read', resource: { type: 'Membership', id } }),
    ).resolves.toBeUndefined();
  });

  it("answers an empty candidate list with the role's grant", async () => {
    const ic = await createVolunteer({ email: 'ic@current.test', role: 'IC' });
    const volunteer = await createVolunteer({ email: 'v3@current.test', role: 'VOLUNTEER' });
    await expect(
      check(ic, { action: 'Announcement.SendStation', resource: [] }),
    ).resolves.toBeUndefined();
    await expect(
      check(volunteer, { action: 'Announcement.SendStation', resource: [] }),
    ).rejects.toEqual(changed);
  });
});
