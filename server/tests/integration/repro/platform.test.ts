import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/app.js';
import { SYSTEM_AUDIT_CONTEXT } from '../../../src/platform/http/auditContext.js';
import { prisma } from '../../../src/platform/db/client.js';
import { clearSettings } from '../../../src/platform/settings/index.js';
import { resetDatabase } from '../../helpers/db.js';
import {
  assignToStation,
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  idempotencyKey,
  type TestVolunteer,
} from '../../helpers/fixtures.js';

/**
 * P03 bug reproductions: errors, idempotency, pagination, audit and state
 * rules that cut across modules. Skipped until fixed; each asserts the correct
 * behaviour and fails today.
 */

let app: Express;
let chief: TestVolunteer;
let ic: TestVolunteer;
let volunteer: TestVolunteer;
let dayId: string;
let stationId: string;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await resetDatabase();
  dayId = (await createEventDayToday()).id;
  stationId = (await createStation({ code: 'DESK' })).id;
  chief = await createVolunteer({ email: 'chief@platform.test', role: 'CHIEF_COORDINATOR' });
  ic = await createVolunteer({ email: 'ic@platform.test', role: 'IC' });
  volunteer = await createVolunteer({ email: 'v@platform.test', role: 'VOLUNTEER' });
});

describe('cross-cutting rules (P03 repros)', () => {
  // F03-002
  it.skip('answers a rename onto an existing gift type with 409, not 500', async () => {
    await prisma.giftType.create({ data: { name: 'Tote Bag', initialStock: 1 } });
    const badge = await prisma.giftType.create({ data: { name: 'Badge', initialStock: 1 } });

    const response = await request(app)
      .patch(`/api/v1/admin/gift-types/${badge.id}`)
      .set('Authorization', bearer(chief))
      .send({ name: 'Tote Bag' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('GIFT_TYPE_EXISTS');
  });

  // F03-011
  it.skip('lets only one retry take over an abandoned idempotency reservation', async () => {
    await assignToStationAllBlocks({ volunteerId: volunteer.id, stationId, eventDayId: dayId });
    const statuses: number[] = [];

    // A race: five abandoned keys, each retried three times at once.
    for (let round = 0; round < 5; round += 1) {
      const key = idempotencyKey();
      await prisma.idempotencyRecord.create({
        data: {
          key,
          endpoint: 'POST /registrations',
          actorSub: volunteer.sub,
          statusCode: 0,
          responseBody: {},
          createdAt: new Date(Date.now() - 5 * 60_000),
        },
      });
      const retries = await Promise.all(
        [1, 2, 3].map(() =>
          request(app)
            .post('/api/v1/registrations')
            .set('Authorization', bearer(volunteer))
            .send({ stationId, category: 'SEC_3', idempotencyKey: key }),
        ),
      );
      statuses.push(...retries.map((response) => response.status));
    }

    expect(statuses.filter((status) => status >= 500)).toEqual([]);
    expect(await prisma.registration.count()).toBe(5);
  });

  // F03-017
  it.skip('returns no next cursor on the last page', async () => {
    await request(app).post('/api/v1/incidents').set('Authorization', bearer(volunteer)).send({
      idempotencyKey: idempotencyKey(),
      type: 'NEAR_MISS',
      severity: 'LOW',
      description: 'Cable across the walkway at the desk',
      occurredAt: new Date().toISOString(),
    });

    const page = await request(app)
      .get('/api/v1/incidents?limit=50')
      .set('Authorization', bearer(ic));
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta.nextCursor).toBeNull();
  });

  // F03-018
  it.skip('audits a lost-person acknowledgement', async () => {
    const alert = await request(app)
      .post('/api/v1/lost-person')
      .set('Authorization', bearer(volunteer))
      .send({ idempotencyKey: idempotencyKey(), descriptionText: 'Child, about 8, red cap' });
    expect(alert.status).toBe(201);

    const ack = await request(app)
      .post(`/api/v1/lost-person/${alert.body.alert.id as string}/ack`)
      .set('Authorization', bearer(ic))
      .send({});
    expect(ack.status).toBe(200);

    expect(await prisma.auditLog.count({ where: { actorId: ic.id } })).toBe(1);
  });

  // F03-018
  it.skip('audits a swap request under its own action, not as a decision', async () => {
    const shift = await assignToStation({
      volunteerId: volunteer.id,
      stationId,
      eventDayId: dayId,
    });
    const other = await createVolunteer({ email: 'other@platform.test', role: 'VOLUNTEER' });

    const response = await request(app)
      .post('/api/v1/roster/swaps')
      .set('Authorization', bearer(volunteer))
      .send({ assignmentId: shift.id, targetVolunteerId: other.id });
    expect(response.status).toBe(201);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: 'ShiftSwapRequest' },
    });
    expect(row.action).not.toBe('swap.decide');
  });

  // F03-018
  it.skip('records where a moved shift was before the move', async () => {
    const other = (await createStation({ code: 'BOOTH' })).id;
    const shift = await assignToStation({
      volunteerId: volunteer.id,
      stationId,
      eventDayId: dayId,
    });

    const response = await request(app)
      .post('/api/v1/admin/assignments')
      .set('Authorization', bearer(chief))
      .send({
        volunteerId: volunteer.id,
        stationId: other,
        eventDayId: dayId,
        block: 'MORNING',
        roleLabel: 'Volunteer',
      });
    expect(response.status).toBe(201);
    expect(response.body.assignment.id).toBe(shift.id);

    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: shift.id } });
    expect(row.before).toMatchObject({ stationId });
  });

  // F03-021
  it.skip('keeps a setting when resetting it cannot be audited', async () => {
    await prisma.appSetting.create({ data: { key: 'eventName', value: 'Dry Run 1' } });

    // An actor id that is not a volunteer makes the audit insert fail.
    await expect(
      clearSettings(['eventName'], { ...SYSTEM_AUDIT_CONTEXT, actorId: 'no-such-volunteer' }),
    ).rejects.toThrow();

    expect(await prisma.appSetting.count({ where: { key: 'eventName' } })).toBe(1);
  });

  // F03-024
  it.skip('does not reopen a resolved incident silently', async () => {
    const incident = await request(app)
      .post('/api/v1/incidents')
      .set('Authorization', bearer(volunteer))
      .send({
        idempotencyKey: idempotencyKey(),
        type: 'ILLNESS',
        severity: 'MEDIUM',
        description: 'Visitor felt faint near the desk',
        occurredAt: new Date().toISOString(),
      });
    const id = incident.body.incident.id as string;
    const setStatus = (status: string) =>
      request(app)
        .post(`/api/v1/incidents/${id}/status`)
        .set('Authorization', bearer(ic))
        .send({ status });

    expect((await setStatus('RESOLVED')).status).toBe(200);
    expect((await setStatus('OPEN')).status).toBe(409);
  });
});
