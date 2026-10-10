import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app/createApp.js';
import { prisma } from '../../../src/platform/db/client.js';
import { resetDatabase } from '../../helpers/db.js';
import {
  bearer,
  createEventDayOn,
  createEventDayToday,
  createStation,
  createVolunteer,
  membershipOf,
  setMembership,
  type TestVolunteer,
} from '../../helpers/fixtures.js';

/**
 * P03 bug reproductions: provisioning and the roster import.
 *
 * Every test here asserts the correct behaviour and FAILS on the code it was
 * written against, which is why it is skipped. The fixing commit (P06) removes
 * the `.skip` and cites the finding id in the tag above the test
 * (remediation/findings/F03-code-quality.md, F02-journeys.md).
 */

let app: Express;
let deputy: TestVolunteer;
let chief: TestVolunteer;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  await createEventDayToday();
  await createStation({ code: 'DCS', name: 'DCS booth' });
  deputy = await createVolunteer({ email: 'deputy@roster.test', role: 'DEPUTY_COORDINATOR' });
  chief = await createVolunteer({ email: 'chief@roster.test', role: 'CHIEF_COORDINATOR' });
});

function importRoster(actor: TestVolunteer, rows: unknown[], commit: boolean): request.Test {
  return request(app)
    .post('/api/v1/roster/import')
    .set('Authorization', bearer(actor))
    .send({ rows, commit });
}

describe('roster import and provisioning (P03 repros)', () => {
  // F02-002
  it('previews a file with two new people instead of failing with a 500', async () => {
    const response = await importRoster(
      chief,
      [
        { displayName: 'New One', email: 'new1@roster.test' },
        { displayName: 'New Two', email: 'new2@roster.test' },
      ],
      false,
    );

    expect(response.status).toBe(200);
    expect(response.body.volunteersCreated).toBe(2);
  });

  // F03-001
  it('does not let a Deputy make their own account an Admin through the import', async () => {
    const response = await importRoster(
      deputy,
      [{ displayName: 'Deputy', email: deputy.email, role: 'ADMIN' }],
      true,
    );

    expect(response.status).toBe(403);
    expect((await membershipOf(deputy.id)).role).toBe('DEPUTY_COORDINATOR');
  });

  // F03-001
  it('does not let a Chief provision an Admin account', async () => {
    const response = await request(app)
      .post('/api/v1/roster/volunteers')
      .set('Authorization', bearer(chief))
      .send({ displayName: 'Minted', email: 'minted@roster.test', role: 'ADMIN' });

    expect(response.status).toBe(403);
    expect(await prisma.person.count({ where: { email: 'minted@roster.test' } })).toBe(0);
  });

  // F03-001
  it('does not reactivate a deactivated account because its email is in the file', async () => {
    const leaver = await createVolunteer({ email: 'leaver@roster.test', role: 'VOLUNTEER' });
    await setMembership(leaver.id, {
      status: 'DEACTIVATED',
      deactivatedAt: new Date(),
      deactivatedReason: 'left',
    });

    await importRoster(deputy, [{ displayName: 'Leaver', email: leaver.email }], true);

    expect((await membershipOf(leaver.id)).status).toBe('DEACTIVATED');
  });

  // F03-001
  it('audits a role change made through the import under the changed person', async () => {
    const volunteer = await createVolunteer({ email: 'promoted@roster.test', role: 'VOLUNTEER' });

    const response = await importRoster(
      chief,
      [{ displayName: 'Promoted', email: volunteer.email, role: 'IC' }],
      true,
    );

    expect(response.status).toBe(200);
    const entry = await prisma.auditLog.findFirst({
      where: { action: 'user.update', entityId: volunteer.id },
    });
    expect(entry?.before).toEqual({ role: 'VOLUNTEER' });
    expect(entry?.after).toEqual({ role: 'IC' });
  });

  // F03-025
  it('counts a new person with two shifts as one created volunteer, not one created and one updated', async () => {
    await createEventDayOn('2027-01-08', 'Day 2');

    const response = await importRoster(
      chief,
      [
        {
          displayName: 'Twice',
          email: 'twice@roster.test',
          stationCode: 'DCS',
          eventDate: '2027-01-07',
          shift: 'MORNING',
        },
        {
          displayName: 'Twice',
          email: 'twice@roster.test',
          stationCode: 'DCS',
          eventDate: '2027-01-08',
          shift: 'MORNING',
        },
      ],
      false,
    );

    expect(response.status).toBe(200);
    expect(response.body.volunteersCreated).toBe(1);
    expect(response.body.volunteersUpdated).toBe(0);
    expect(response.body.assignmentsCreated).toBe(2);
  });

  // F03-044
  it('links a new volunteer to a manager already on the roster', async () => {
    const ic = await createVolunteer({ email: 'ic@roster.test', role: 'IC' });

    const response = await importRoster(
      chief,
      [{ displayName: 'New', email: 'newbie@roster.test', reportsToEmail: ic.email }],
      true,
    );

    expect(response.status).toBe(200);
    expect(response.body.issues).toEqual([]);
    const newbie = await prisma.person.findUniqueOrThrow({
      where: { email: 'newbie@roster.test' },
    });
    expect((await membershipOf(newbie.id)).reportsTo?.personId).toBe(ic.id);
  });

  // F03-044
  it('skips a deactivated person whose row names a manager, instead of failing the import', async () => {
    const leaver = await createVolunteer({ email: 'gone@roster.test', role: 'VOLUNTEER' });
    await setMembership(leaver.id, { status: 'DEACTIVATED' });

    const response = await importRoster(
      chief,
      [
        { displayName: 'Gone', email: leaver.email, reportsToEmail: 'boss@roster.test' },
        { displayName: 'Boss', email: 'boss@roster.test', role: 'IC' },
      ],
      false,
    );

    expect(response.status).toBe(200);
    expect(response.body.issues.map((issue: { field: string }) => issue.field)).toEqual(['email']);
  });

  // F03-044
  it('audits a role change once per person, not once per row', async () => {
    const promoted = await createVolunteer({ email: 'up@roster.test', role: 'VOLUNTEER' });

    await importRoster(
      chief,
      [
        { displayName: 'Up', email: promoted.email, role: 'IC' },
        { displayName: 'Up', email: promoted.email, role: 'IC' },
      ],
      true,
    );

    expect(
      await prisma.auditLog.count({ where: { action: 'user.update', entityId: promoted.id } }),
    ).toBe(1);
  });

  // F03-043
  it("does not create accounts from a Deputy's import", async () => {
    const response = await importRoster(
      deputy,
      [{ displayName: 'Stranger', email: 'stranger@roster.test' }],
      true,
    );

    expect(response.status).toBe(400);
    expect(response.body.error.details.issues[0]?.field).toBe('email');
    expect(await prisma.person.count({ where: { email: 'stranger@roster.test' } })).toBe(0);
  });
});
