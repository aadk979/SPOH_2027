import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, expect, it } from 'vitest';
import * as contracts from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { rawDb } from '../helpers/db.js';
import { assignToStation, bearer } from '../helpers/fixtures.js';
import { workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
import { FROZEN_NOW } from '../setup.js';
import { workspaceReadValidationCases } from '../helpers/p16WorkspaceReadValidationCases.js';
const app = createApp();
let fixture: WorkspaceFixture, giftTypeId: string, assignmentId: string;
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
  assignmentId = (
    await assignToStation({
      volunteerId: fixture.admin.id,
      stationId: fixture.first,
      eventDayId: fixture.dayId,
    })
  ).id;
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
    audits: await rawDb.auditLog.findMany({
      where: { eventId: fixture.eventId },
      orderBy: { id: 'asc' },
    }),
  };
}
it.each(['scoped', 'alias'])(
  '%s validates all 133 malformed workspace queries after 13 successful source-backed controls',
  async (form) => {
    const corpus = workspaceReadValidationCases({
      stationId: fixture.first,
      giftTypeId,
      assignmentId,
      personId: fixture.admin.id,
      now: FROZEN_NOW.toISOString(),
    });
    expect(corpus.invalid).toHaveLength(133);
    expect(corpus.valid).toHaveLength(13);
    expect(new Set(corpus.invalid.map((row) => row.id)).size).toBe(133);
    const querySchema = {
        entity: contracts.EntityQuery,
        records: contracts.RecordsQuery,
        search: contracts.SearchQuery,
      },
      responseSchema = {
        entity: contracts.EntityResponse,
        records: contracts.RecordsResponse,
        search: contracts.SearchResponse,
      };
    const prefix =
      (form === 'scoped' ? '/api/v1/events/' + fixture.eventId : '/api/v1') + '/workspace/';
    for (const [index, row] of corpus.valid.entries()) {
      expect(querySchema[row.route].safeParse(row.query).success, 'valid:' + index).toBe(true);
      const response = await request(app)
        .get(prefix + row.route)
        .set('Authorization', bearer(fixture.admin))
        .query(row.query);
      expect(response.status, 'valid:' + index).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      responseSchema[row.route].parse(response.body);
      if (row.route === 'records' && row.query.kind === 'footfall') {
        const body = contracts.RecordsResponse.parse(response.body);
        expect(body.aggregate).toEqual({ value: 7, unit: 'roomEntries' });
        expect(body.meta.count).toBe(1);
      }
    }
    const before = await snapshot();
    for (const row of corpus.invalid) {
      expect(querySchema[row.route].safeParse(row.query).success, row.id).toBe(false);
      const response = await request(app)
        .get(prefix + row.route)
        .set('Authorization', bearer(fixture.admin))
        .query(row.query);
      expect(response.status, row.id).toBe(400);
      expect(contracts.ErrorBody.parse(response.body).error.code, row.id).toBe(
        contracts.ERROR_CODES.VALIDATION_FAILED,
      );
    }
    expect(await snapshot()).toEqual(before);
  },
);
