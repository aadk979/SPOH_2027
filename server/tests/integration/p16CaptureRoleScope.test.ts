import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ROLE_IDS } from '@spoh/access-policies';
import { ErrorBody } from '@spoh/shared';
import { beforeEach, expect, it } from 'vitest';
import { createApp } from '../../src/app/createApp.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import {
  assignToStationAllBlocks,
  bearer,
  createEventDayToday,
  createStation,
  createVolunteer,
  testEvent,
} from '../helpers/fixtures.js';

const app = createApp();
beforeEach(() => resetDatabase());
const routes = ['registration', 'group', 'tick', 'bulk', 'stamp', 'gift'] as const;
type Route = (typeof routes)[number];
const forms = ['scoped', 'alias'] as const;
const scopes = ['assigned', 'other-station'] as const;
const cases = ROLE_IDS.flatMap((role) =>
  forms.flatMap((form) =>
    scopes.flatMap((scope) => routes.map((route) => ({ role, form, scope, route }))),
  ),
);
const cardCode = 'PSCP22';

function capture(route: Route, stationId: string, giftTypeId: string) {
  const envelope = {
    idempotencyKey: randomUUID(),
    clientRecordedAt: new Date().toISOString(),
    rehearsal: false,
  };
  switch (route) {
    case 'registration':
      return { path: '/registrations', body: { ...envelope, stationId, category: 'SEC_4' } };
    case 'group':
      return {
        path: '/registrations/group',
        body: { ...envelope, stationId, members: [{ category: 'SEC_4', count: 2 }] },
      };
    case 'tick':
      return { path: '/footfall/ticks', body: { ...envelope, stationId } };
    case 'bulk':
      return {
        path: '/footfall/bulk',
        body: {
          ...envelope,
          stationId,
          quantity: 2,
          timeBlockStart: new Date().toISOString(),
          source: 'PAPER',
          reason: 'Synthetic P16 paper count for a controlled station-scope test.',
        },
      };
    case 'stamp':
      return { path: `/cards/${cardCode}/stamps`, body: { ...envelope, stationId } };
    case 'gift':
      return { path: '/gifts/redemptions', body: { ...envelope, stationId, giftTypeId } };
  }
}

it.each(cases)(
  '$form $role $scope $route preserves the approved capture and correction boundaries',
  async ({ role, form, scope, route }) => {
    const { eventId } = await testEvent(),
      day = await createEventDayToday();
    const own = await createStation({
      code: 'P16_SCOPE_OWN',
      countsEntry: true,
      issuesStamp: true,
    });
    const other = await createStation({
      code: 'P16_SCOPE_OTHER',
      countsEntry: true,
      issuesStamp: true,
    });
    await rawDb.stationType.updateMany({
      where: { eventId, code: 'OTHER_COUNTED_STAMPED' },
      data: { registersVisitors: true, redeemsGifts: true },
    });
    const actor = await createVolunteer({
      email: `${role.toLowerCase()}@p16-capture-scope.test`,
      role,
    });
    await assignToStationAllBlocks({
      volunteerId: actor.id,
      stationId: own.id,
      eventDayId: day.id,
    });
    const gift = await rawDb.giftType.create({
      data: { eventId, name: 'Synthetic test gift', initialStock: 100, lowStockThreshold: 0 },
    });
    await rawDb.missionCard.create({
      data: {
        eventId,
        shortCode: cardCode,
        qrPayload: 'p16-controlled-scope-card',
        status: 'ISSUED',
        issuedAt: new Date(),
      },
    });
    const offStation = scope === 'other-station';
    const stationId = offStation ? other.id : own.id;
    const input = capture(route, stationId, gift.id),
      base = form === 'scoped' ? `/api/v1/events/${eventId}` : '/api/v1';
    const response = await request(app)
      .post(base + input.path)
      .set('Authorization', bearer(actor))
      .send(input.body);
    const granted = role !== 'LEAD' && (route !== 'bulk' || role !== 'VOLUNTEER');
    const scopeBlocked = offStation && role === 'VOLUNTEER' && route !== 'bulk';
    const allowed = granted && !scopeBlocked;
    expect(response.status).toBe(allowed ? 201 : 403);
    if (!allowed)
      expect(ErrorBody.parse(response.body).error.code).toBe(
        scopeBlocked ? 'STATION_SCOPE_DENIED' : 'FORBIDDEN',
      );
    const registrations = await rawDb.registration.findMany({ where: { eventId } });
    const ticks = await rawDb.footfallTick.findMany({ where: { eventId } });
    const stamps = await rawDb.cardStampEvent.findMany({ where: { eventId } });
    const redemptions = await rawDb.giftRedemption.findMany({ where: { eventId } });
    expect(registrations).toHaveLength(
      allowed && (route === 'registration' || route === 'group') ? (route === 'group' ? 2 : 1) : 0,
    );
    expect(ticks).toHaveLength(allowed && (route === 'tick' || route === 'bulk') ? 1 : 0);
    expect(stamps).toHaveLength(allowed && route === 'stamp' ? 1 : 0);
    expect(redemptions).toHaveLength(allowed && route === 'gift' ? 1 : 0);
    if (ticks.length)
      expect(ticks[0]).toMatchObject({
        stationId,
        quantity: route === 'bulk' ? 2 : 1,
        recordedById: actor.id,
      });
    for (const row of [...registrations, ...stamps, ...redemptions])
      expect(row.stationId).toBe(stationId);
    const bypasses = await rawDb.auditLog.findMany({
      where: { eventId, action: 'auth.stationScopeBypass' },
    });
    expect(bypasses).toHaveLength(allowed && offStation ? 1 : 0);
    if (bypasses.length)
      expect(bypasses[0]).toMatchObject({ actorId: actor.id, entityId: stationId });
  },
);

it.each(forms.flatMap((form) => routes.map((route) => ({ form, route }))))(
  '$form $route refuses a genuine other-event member without creating a record',
  async ({ form, route }) => {
    const { eventId } = await testEvent();
    const own = await createStation({
      code: 'P16_FOREIGN_SCOPE',
      countsEntry: true,
      issuesStamp: true,
    });
    const foreign = await createVolunteer({ email: 'foreign@p16-capture-scope.test', role: 'IC' });
    const organisation = await rawDb.organisation.create({
      data: {
        slug: 'p16-foreign-scope-org',
        name: 'Synthetic foreign organisation',
        appName: 'Synthetic scope test',
        defaultTimezone: 'Asia/Singapore',
      },
    });
    const event = await rawDb.event.create({
      data: {
        organisationId: organisation.id,
        slug: 'p16-foreign-scope-event',
        name: 'Synthetic foreign event',
        timezone: 'Asia/Singapore',
        status: 'LIVE',
      },
    });
    await rawDb.eventMembership.updateMany({
      where: { personId: foreign.id, eventId },
      data: { eventId: event.id },
    });
    const gift = await rawDb.giftType.create({
      data: {
        eventId,
        name: 'Synthetic foreign test gift',
        initialStock: 100,
        lowStockThreshold: 0,
      },
    });
    await rawDb.missionCard.create({
      data: {
        eventId,
        shortCode: cardCode,
        qrPayload: 'p16-foreign-scope-card',
        status: 'ISSUED',
        issuedAt: new Date(),
      },
    });
    const input = capture(route, own.id, gift.id),
      base = form === 'scoped' ? `/api/v1/events/${eventId}` : '/api/v1';
    const response = await request(app)
      .post(base + input.path)
      .set('Authorization', bearer(foreign))
      .send(input.body);
    // Legacy aliases always select Event #1, where this actor has no membership.
    expect(response.status).toBe(form === 'scoped' ? 404 : 403);
    expect(ErrorBody.parse(response.body).error.code).toBe(
      form === 'scoped' ? 'NOT_FOUND' : 'NOT_PROVISIONED',
    );
    expect(
      await Promise.all([
        rawDb.registration.count({ where: { eventId } }),
        rawDb.footfallTick.count({ where: { eventId } }),
        rawDb.cardStampEvent.count({ where: { eventId } }),
        rawDb.giftRedemption.count({ where: { eventId } }),
      ]),
    ).toEqual([0, 0, 0, 0]);
  },
);
