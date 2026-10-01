import { beforeEach, expect, it, vi } from 'vitest';
import {
  generateReport,
  generateReportInTransaction,
} from '../../src/modules/report/application/generateReport.js';
import * as reads from '../../src/modules/report/data/repo.js';
import { resetDatabase, rawDb } from '../helpers/db.js';
import { createStation, createVolunteer, idempotencyKey, testEvent } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

// Match the production client's extended delegate types without adding its request scope guard.
const transactionDb = rawDb.$extends({ query: {} });

let eventId: string;
let stationId: string;
let actorId: string;
let giftId: string;
let categoryId: string;

beforeEach(async () => {
  await resetDatabase();
  eventId = (await testEvent()).eventId;
  stationId = (
    await createStation({ code: 'REPORT_TX', name: 'Original station', countsEntry: true })
  ).id;
  actorId = (
    await createVolunteer({
      email: 'report-tx@test.invalid',
      role: 'CHIEF_COORDINATOR',
      displayName: 'Original declarer',
    })
  ).id;
  categoryId = (await rawDb.captureCategory.findFirstOrThrow({ where: { eventId, code: 'OTHER' } }))
    .id;
  giftId = (
    await rawDb.giftType.create({ data: { eventId, name: 'Original gift', initialStock: 10 } })
  ).id;
});

it('reads every section and supporting name/setting through the supplied transaction, then rolls back', async () => {
  const rollback = new Error('Deliberate rollback');
  await expect(
    transactionDb.$transaction(
      async (tx) => {
        await tx.event.update({
          where: { id: eventId },
          data: {
            name: 'Uncommitted event',
            timezone: 'Europe/London',
            status: 'CLOSED',
            closedAt: FROZEN_NOW,
          },
        });
        await tx.person.update({
          where: { id: actorId },
          data: { displayName: 'Uncommitted declarer' },
        });
        await tx.station.update({
          where: { eventId, id: stationId },
          data: { name: 'Uncommitted station' },
        });
        await tx.captureCategory.update({
          where: { eventId, id: categoryId },
          data: { label: 'Uncommitted category' },
        });
        await tx.giftType.update({
          where: { eventId, id: giftId },
          data: { name: 'Uncommitted gift', initialStock: 20 },
        });
        await tx.setting.create({
          data: {
            scope: 'EVENT',
            scopeId: eventId,
            eventId,
            key: 'product.countsMode',
            value: { mode: 'headline', source: { count: 'footfall', stationId } },
            version: 1,
          },
        });
        await tx.registration.createMany({
          data: [false, true].map((rehearsal) => ({
            eventId,
            stationId,
            categoryId,
            recordedById: actorId,
            recordedAt: FROZEN_NOW,
            rehearsal,
            idempotencyKey: idempotencyKey(),
          })),
        });
        await tx.footfallTick.create({
          data: {
            eventId,
            stationId,
            recordedById: actorId,
            recordedAt: FROZEN_NOW,
            quantity: 2,
            idempotencyKey: idempotencyKey(),
          },
        });
        await tx.missionCard.create({
          data: {
            eventId,
            shortCode: 'TXCARD',
            qrPayload: 'TX-CARD',
            status: 'ISSUED',
            issuedAt: FROZEN_NOW,
          },
        });
        await tx.giftStockAdjustment.create({
          data: {
            eventId,
            giftTypeId: giftId,
            delta: 3,
            createdById: actorId,
            reason: 'Uncommitted adjustment',
          },
        });
        await tx.incident.create({
          data: {
            eventId,
            type: 'NEAR_MISS',
            severity: 'LOW',
            stationId,
            reportedById: actorId,
            occurredAt: FROZEN_NOW,
            description: 'Uncommitted incident',
            idempotencyKey: idempotencyKey(),
          },
        });
        await tx.fallbackWindow.create({
          data: {
            eventId,
            tier: 4,
            stationId,
            startedAt: FROZEN_NOW,
            declaredById: actorId,
            reason: 'Uncommitted window',
          },
        });
        await tx.importBatch.create({
          data: {
            eventId,
            source: 'PAPER',
            targetTable: 'Registration',
            rowCount: 1,
            importedById: actorId,
          },
        });
        const report = await generateReportInTransaction(tx, { eventId }, { query: {} });
        expect(report.event).toMatchObject({ name: 'Uncommitted event', status: 'CLOSED' });
        expect(report.timezone).toBe('Europe/London');
        expect(report.registrations).toMatchObject({
          total: 1,
          byCategory: [{ label: 'Uncommitted category', value: 1 }],
        });
        expect(report.footfall).toMatchObject({
          total: 2,
          byStation: [{ stationName: 'Uncommitted station', total: 2 }],
        });
        expect(report.cards.issued).toBe(1);
        expect(report.gifts.byGiftType).toMatchObject([
          { giftTypeName: 'Uncommitted gift', remaining: 23, rehearsal: false },
        ]);
        expect(report.safety.incidents).toMatchObject([
          { description: 'Uncommitted incident', stationName: 'Uncommitted station' },
        ]);
        expect(report.volunteers.volunteersActive).toBe(1);
        expect(report.dataIntegrity.fallbackWindows).toMatchObject([
          { declaredByName: 'Uncommitted declarer', stationName: 'Uncommitted station' },
        ]);
        expect(report.dataIntegrity.imports).toHaveLength(1);
        expect(report.rehearsalIncluded).toBe(false);
        expect(report.headline).toMatchObject({
          value: 2,
          sourceLabel: 'from entries counted at Uncommitted station',
        });
        const included = await generateReportInTransaction(
          tx,
          { eventId },
          { query: { includeRehearsal: true } },
        );
        expect(included.registrations.total).toBe(2);
        expect(included.rehearsalIncluded).toBe(true);
        throw rollback;
      },
      { timeout: 30_000 },
    ),
  ).rejects.toBe(rollback);
  const committed = await generateReport({ eventId }, {});
  expect(committed.event.name).toBe('Test Event');
  expect(committed.registrations.total).toBe(0);
  expect(committed.footfall.total).toBe(0);
  expect(committed.cards.issued).toBe(0);
  expect(committed.gifts.byGiftType[0]?.remaining).toBe(10);
  expect(committed.safety.incidents).toEqual([]);
  expect(committed.dataIntegrity.fallbackWindows).toEqual([]);
});

it('keeps all sections on one committed snapshot when captures arrive between reads', async () => {
  const original = reads.registrationTotals;
  const interception = vi
    .spyOn(reads, 'registrationTotals')
    .mockImplementationOnce(async (...args) => {
      const totals = await original(...args);
      await rawDb.footfallTick.create({
        data: {
          eventId,
          stationId,
          recordedById: actorId,
          recordedAt: FROZEN_NOW,
          quantity: 7,
          idempotencyKey: idempotencyKey(),
        },
      });
      await rawDb.giftStockAdjustment.create({
        data: {
          eventId,
          giftTypeId: giftId,
          delta: 9,
          createdById: actorId,
          reason: 'Concurrent adjustment',
        },
      });
      await rawDb.incident.create({
        data: {
          eventId,
          type: 'NEAR_MISS',
          severity: 'LOW',
          stationId,
          reportedById: actorId,
          occurredAt: FROZEN_NOW,
          description: 'Concurrent incident',
          idempotencyKey: idempotencyKey(),
        },
      });
      return totals;
    });
  try {
    const frozen = await generateReport({ eventId }, {});
    expect(frozen.footfall.total).toBe(0);
    expect(frozen.gifts.byGiftType[0]?.remaining).toBe(10);
    expect(frozen.safety.incidents).toEqual([]);
  } finally {
    interception.mockRestore();
  }
  const fresh = await generateReport({ eventId }, {});
  expect(fresh.footfall.total).toBe(7);
  expect(fresh.gifts.byGiftType[0]?.remaining).toBe(19);
  expect(fresh.safety.incidents).toMatchObject([{ description: 'Concurrent incident' }]);
});
