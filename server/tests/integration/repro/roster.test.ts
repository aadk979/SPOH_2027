import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { prisma } from '../../../src/lib/prisma.js';
import { resetDatabase } from '../../helpers/db.js';
import {
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
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
    const row = await prisma.volunteer.findUniqueOrThrow({ where: { id: deputy.id } });
    expect(row.role).toBe('DEPUTY_COORDINATOR');
  });

  // F03-001
  it('does not let a Chief provision an Admin account', async () => {
    const response = await request(app)
      .post('/api/v1/roster/volunteers')
      .set('Authorization', bearer(chief))
      .send({ displayName: 'Minted', email: 'minted@roster.test', role: 'ADMIN' });

    expect(response.status).toBe(403);
    expect(await prisma.volunteer.count({ where: { email: 'minted@roster.test' } })).toBe(0);
  });

  // F03-001
  it('does not reactivate a deactivated account because its email is in the file', async () => {
    const leaver = await createVolunteer({ email: 'leaver@roster.test', role: 'VOLUNTEER' });
    await prisma.volunteer.update({
      where: { id: leaver.id },
      data: { active: false, deactivatedAt: new Date(), deactivatedReason: 'left' },
    });

    await importRoster(deputy, [{ displayName: 'Leaver', email: leaver.email }], true);

    const row = await prisma.volunteer.findUniqueOrThrow({ where: { id: leaver.id } });
    expect(row.active).toBe(false);
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
  it.skip('counts a new person with two shifts as one created volunteer, not one created and one updated', async () => {
    await prisma.eventDay.create({
      data: { date: new Date('2027-01-08T00:00:00.000Z'), label: 'Day 2' },
    });

    const response = await importRoster(
      chief,
      [
        {
          displayName: 'Twice',
          email: 'twice@roster.test',
          stationCode: 'DCS',
          eventDate: '2027-01-07',
          block: 'MORNING',
        },
        {
          displayName: 'Twice',
          email: 'twice@roster.test',
          stationCode: 'DCS',
          eventDate: '2027-01-08',
          block: 'MORNING',
        },
      ],
      false,
    );

    expect(response.status).toBe(200);
    expect(response.body.volunteersCreated).toBe(1);
    expect(response.body.volunteersUpdated).toBe(0);
    expect(response.body.assignmentsCreated).toBe(2);
  });
});
