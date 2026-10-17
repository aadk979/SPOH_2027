import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import * as contracts from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb } from '../helpers/db.js';
import { assignToStation, bearer } from '../helpers/fixtures.js';
import { workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
import { FROZEN_NOW } from '../setup.js';
import { workspaceRecordFieldCases } from '../helpers/p16WorkspaceRecordFieldCases.js';
const app = createApp();
let fixture: WorkspaceFixture, giftTypeId: string;
beforeEach(async () => {
  fixture = await workspaceFixture();
  giftTypeId = (
    await rawDb.giftType.create({
      data: {
        eventId: fixture.eventId,
        name: 'Synthetic workspace validation stock',
        initialStock: 100,
      },
    })
  ).id;
  await assignToStation({
    volunteerId: fixture.admin.id,
    stationId: fixture.first,
    eventDayId: fixture.dayId,
  });
  await rawDb.footfallTick.create({
    data: {
      eventId: fixture.eventId,
      stationId: fixture.first,
      recordedById: fixture.volunteer.id,
      recordedByMembershipId: fixture.recorder.id,
      quantity: 7,
      source: 'APP',
      recordedAt: FROZEN_NOW,
      idempotencyKey: randomUUID(),
    },
  });
});
async function snapshot() {
  return {
    registrations: await rawDb.registration.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    cards: await rawDb.missionCard.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    stamps: await rawDb.cardStampEvent.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    redemptions: await rawDb.giftRedemption.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    stations: await rawDb.station.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    assignments: await rawDb.shiftAssignment.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    footfall: await rawDb.footfallTick.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    gifts: await rawDb.giftType.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    incidents: await rawDb.incident.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    alerts: await rawDb.lostPersonAlert.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    foundItems: await rawDb.lostFoundItem.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    announcements: await rawDb.announcement.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    imports: await rawDb.importBatch.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    fallback: await rawDb.fallbackWindow.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    stockAdjustments: await rawDb.giftStockAdjustment.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    people: await rawDb.person.findMany({
      where: { id: { in: [fixture.admin.id, fixture.ic.id, fixture.volunteer.id] } },
      orderBy: { id: 'asc' },
    }),
    memberships: await rawDb.eventMembership.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    days: await rawDb.eventDay.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
    audits: await rawDb.auditLog.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
  };
}
const fieldCounts = {
  registrations: 71,
  footfall: 62,
  cards: 53,
  stamps: 56,
  redemptions: 65,
  incidents: 59,
  'lost-person': 47,
  'lost-found': 47,
  announcements: 38,
  assignments: 56,
  imports: 35,
  fallback: 47,
  'gift-ledger': 40,
  audit: 38,
  people: 22,
  days: 20,
};
// Separate fixtures keep every kind below the unchanged real request quota.
it.each(
  ['scoped', 'alias'].flatMap((form) =>
    Object.entries(fieldCounts).map(([kind, count]) => ({ form, kind, count })),
  ),
)('$form validates frozen malformed fields for $kind', async ({ form, kind, count }) => {
  const corpus = workspaceRecordFieldCases({
    stationId: fixture.first,
    giftTypeId,
    personId: fixture.admin.id,
    now: FROZEN_NOW.toISOString(),
  });
  expect(corpus.invalid).toHaveLength(756);
  expect(corpus.valid).toHaveLength(16);
  expect(new Set(corpus.invalid.map((row) => row.id)).size).toBe(756);
  expect(corpus.recordKinds).toEqual(Object.keys(fieldCounts));
  const invalid = corpus.invalid.filter((row) => row.kind === kind);
  const valid = corpus.valid.filter((row) => row.query.kind === kind);
  expect(invalid).toHaveLength(count);
  expect(valid).toHaveLength(1);
  const prefix =
    (form === 'scoped' ? '/api/v1/events/' + fixture.eventId : '/api/v1') + '/workspace/';
  for (const row of valid) {
    expect(contracts.RecordsQuery.safeParse(row.query).success, row.id).toBe(true);
    const response = await request(app)
      .get(prefix + row.route)
      .set('Authorization', bearer(fixture.admin))
      .query(row.query);
    expect(response.status, row.id).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    contracts.RecordsResponse.parse(response.body);
    if (row.route === 'records' && row.query.kind === 'footfall') {
      const body = contracts.RecordsResponse.parse(response.body);
      expect(body.aggregate).toEqual({ value: 7, unit: 'roomEntries' });
      expect(body.meta.count).toBe(1);
    }
  }
  const before = await snapshot();
  for (const row of invalid) {
    expect(contracts.RecordsQuery.safeParse(row.query).success, row.id).toBe(false);
    const response = await request(app)
      .get(prefix + row.route)
      .set('Authorization', bearer(fixture.admin))
      .query(row.query);
    expect(response.status, row.id).toBe(400);
    expect(response.headers['cache-control'], row.id).toBe('private, no-store');
    expect(contracts.ErrorBody.parse(response.body).error.code, row.id).toBe(
      contracts.ERROR_CODES.VALIDATION_FAILED,
    );
  }
  expect(await snapshot()).toEqual(before);
});
