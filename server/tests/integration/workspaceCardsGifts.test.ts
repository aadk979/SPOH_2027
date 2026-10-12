import { afterEach, beforeEach, expect, it } from 'vitest';
import { EntityResponse, RecordsResponse } from '@spoh/shared';
import { cardWorkspaceSource, getFunnel, stampWorkspaceSource } from '../../src/modules/missionCard/index.js';
import { giftWorkspaceSource, listGifts, redemptionWorkspaceSource } from '../../src/modules/gift/index.js';
import { getLiveDashboard } from '../../src/modules/dashboard/application/getLiveDashboard.js';
import { useAuthorizer } from '../../src/platform/access/engine.js';
import { rawDb } from '../helpers/db.js';
import { idempotencyKey } from '../helpers/fixtures.js';
import { SOURCE_BEFORE, SOURCE_FUTURE, workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
import { FROZEN_NOW } from '../setup.js';

let fixture: WorkspaceFixture;
beforeEach(async () => { fixture = await workspaceFixture(); });
afterEach(() => useAuthorizer(null));

function card(shortCode: string, input: { issuedAt?: Date; rehearsal?: boolean; status?: 'ISSUED' | 'COMPLETED' | 'LOST' } = {}) {
  return rawDb.missionCard.create({ data: { eventId: fixture.eventId, shortCode, qrPayload: `private-qr-${shortCode}`,
    status: input.status ?? 'COMPLETED', issuedAt: input.issuedAt ?? FROZEN_NOW, createdAt: SOURCE_BEFORE,
    rehearsal: input.rehearsal ?? false } });
}
function redemption(giftTypeId: string, input: { missionCardId?: string; rehearsal?: boolean; at?: Date; voided?: boolean;
  id?: string; flag?: 'OVER_STOCK'; stationId?: string } = {}) {
  return rawDb.giftRedemption.create({ data: { eventId: fixture.eventId, giftTypeId, stationId: input.stationId ?? fixture.first,
    recordedById: fixture.volunteer.id, recordedByMembershipId: fixture.recorder.id,
    recordedAt: input.at ?? FROZEN_NOW, rehearsal: input.rehearsal ?? false, voided: input.voided ?? false,
    idempotencyKey: idempotencyKey(), ...(input.missionCardId ? { missionCardId: input.missionCardId } : {}),
    ...(input.id ? { id: input.id } : {}), ...(input.flag ? { flag: input.flag } : {}) } });
}
function stamp(missionCardId: string, input: { stationId?: string; at?: Date; rehearsal?: boolean } = {}) {
  return rawDb.cardStampEvent.create({ data: { eventId: fixture.eventId, missionCardId,
    stationId: input.stationId ?? fixture.first, recordedById: fixture.volunteer.id,
    recordedByMembershipId: fixture.recorder.id, recordedAt: input.at ?? FROZEN_NOW,
    rehearsal: input.rehearsal ?? false, idempotencyKey: idempotencyKey() } });
}

it('reproduces issued, completed, station and distinct redeemed funnel counts at the exact observation boundary', async () => {
  const gift = await rawDb.giftType.create({ data: { eventId: fixture.eventId, name: 'Funnel gift', initialStock: 10 } });
  const older = await card('OLD123', { issuedAt: SOURCE_BEFORE });
  const boundary = await card('NOW123');
  const future = await card('FUT123', { issuedAt: SOURCE_FUTURE });
  const practice = await card('PRC123', { rehearsal: true });
  const lost = await card('LST123', { status: 'LOST' });
  for (const row of [older, boundary, future, practice, lost]) {
    await stamp(row.id, { at: row.id === future.id ? SOURCE_FUTURE : FROZEN_NOW, rehearsal: row.rehearsal });
  }
  await redemption(gift.id, { missionCardId: older.id });
  await redemption(gift.id, { missionCardId: older.id });
  await redemption(gift.id, { missionCardId: boundary.id });
  await redemption(gift.id, { missionCardId: future.id, at: SOURCE_FUTURE });
  await redemption(gift.id, { missionCardId: practice.id, rehearsal: true });
  const context = await fixture.reader(fixture.admin);
  const funnel = await getFunnel(fixture.scope, { from: SOURCE_BEFORE.toISOString() }, FROZEN_NOW);
  expect(funnel).toMatchObject({ issued: 2, completed: 2, redeemed: 2 });
  for (const stage of ['issued', 'completed', 'redeemed', 'station'] as const) {
    const filter = { kind: 'cards' as const, stage, from: SOURCE_BEFORE.toISOString(), asOf: FROZEN_NOW.toISOString(),
      ...(stage === 'station' ? { stationId: fixture.first } : {}) };
    const records = RecordsResponse.parse(await cardWorkspaceSource.records!(context, { filter, limit: 1 }));
    expect(records.aggregate).toEqual({ value: 2, unit: 'cards' });
    expect(records.meta.count).toBe(2);
    const next = RecordsResponse.parse(await cardWorkspaceSource.records!(context, { filter, limit: 1, cursor: records.meta.nextCursor! }));
    expect(next.data[0]?.id).not.toBe(records.data[0]?.id);
    await expect(cardWorkspaceSource.records!(context, { filter, limit: 1, cursor: future.id })).rejects.toMatchObject({ statusCode: 404 });
  }
  const stamps = RecordsResponse.parse(await stampWorkspaceSource.records!(context,
    { filter: { kind: 'stamps', stationId: fixture.first, excludeLost: true, asOf: FROZEN_NOW.toISOString() }, limit: 1 }));
  expect(stamps.aggregate).toEqual({ value: 2, unit: 'stampRows' });
  const live = await getLiveDashboard(fixture.scope, FROZEN_NOW, context);
  expect(live.cards).toMatchObject({ issued: 2, completed: 2, redeemed: 2 });
  expect((await getFunnel(fixture.scope, { to: FROZEN_NOW.toISOString() }, FROZEN_NOW)).issued).toBe(1);
});

it('keeps the Self.Read card journey minimal with exact redeemed state and a bounded station projection', async () => {
  const row = await card('JRN123');
  await stamp(row.id);
  await stamp(row.id, { stationId: fixture.second, at: SOURCE_FUTURE });
  const station = await rawDb.station.findFirstOrThrow({ where: { id: fixture.first } });
  await rawDb.station.createMany({ data: Array.from({ length: 52 }, (_, index) => ({ eventId: fixture.eventId,
    typeId: station.typeId, code: `JOURNEY_${index}`, name: `Journey station ${index}` })) });
  const gift = await rawDb.giftType.create({ data: { eventId: fixture.eventId, name: 'Journey gift', initialStock: 10 } });
  await redemption(gift.id, { missionCardId: row.id, at: SOURCE_FUTURE });
  const context = await fixture.reader(fixture.volunteer);
  const detail = EntityResponse.parse(await cardWorkspaceSource.entity(context, { kind: 'card', id: row.id }));
  expect(detail.fields).toContainEqual({ label: 'Stations left', value: 53, format: 'number' });
  expect(detail.fields).toContainEqual({ label: 'Redeemed', value: false, format: 'boolean' });
  expect(detail.related.filter((link) => link.label.startsWith('Still to visit:'))).toHaveLength(50);
  expect(detail.related.some((link) => link.destination.type === 'records')).toBe(false);
  expect(detail.facets).toContainEqual(expect.objectContaining({ name: 'Stations left', availability: 'available' }));
  expect(JSON.stringify(detail)).not.toMatch(/private-qr|sources-volunteer|recordedBy|cognito/);
  await redemption(gift.id, { missionCardId: row.id });
  const current = EntityResponse.parse(await cardWorkspaceSource.entity(context, { kind: 'card', id: row.id }));
  expect(current.fields).toContainEqual({ label: 'Redeemed', value: true, format: 'boolean' });
  const authorized = EntityResponse.parse(await cardWorkspaceSource.entity(await fixture.reader(fixture.admin), { kind: 'card', id: row.id }));
  expect(authorized.related).toContainEqual(expect.objectContaining({ destination: { type: 'records',
    filter: { kind: 'registrations', cardId: row.id, rehearsal: false } } }));
});

it('uses source-qualified equal-ID ledger cursors and computes balance from all retained history at asOf', async () => {
  const gift = await rawDb.giftType.create({ data: { eventId: fixture.eventId, name: 'Ledger gift', initialStock: 10, rehearsalInitialStock: 50 } });
  const sharedId = 'same-id-across-ledger-tables';
  for (const change of [{ id: 'older-adjustment', delta: 2, createdAt: SOURCE_BEFORE },
    { id: sharedId, delta: 3, createdAt: FROZEN_NOW }, { id: 'future-adjustment', delta: 100, createdAt: SOURCE_FUTURE },
    { id: 'practice-adjustment', delta: 4, createdAt: FROZEN_NOW, rehearsal: true }]) {
    await rawDb.giftStockAdjustment.create({ data: { eventId: fixture.eventId, giftTypeId: gift.id,
      reason: 'Stock count checked', createdById: fixture.admin.id, ...change } });
  }
  await redemption(gift.id, { id: sharedId });
  await redemption(gift.id, { voided: true });
  await redemption(gift.id, { rehearsal: true });
  await redemption(gift.id, { at: SOURCE_FUTURE });
  const context = await fixture.reader(fixture.admin);
  const filter = { kind: 'gift-ledger' as const, giftTypeId: gift.id, rehearsal: false,
    from: FROZEN_NOW.toISOString(), asOf: FROZEN_NOW.toISOString() };
  let result = RecordsResponse.parse(await giftWorkspaceSource.records!(context, { filter, limit: 1 }));
  expect(result.aggregate).toMatchObject({ value: 2, openingStock: 10, balance: 14, unit: 'stock' });
  expect(result.meta.count).toBe(3);
  const ids = result.data.map((row) => row.id);
  while (result.meta.nextCursor) {
    result = RecordsResponse.parse(await giftWorkspaceSource.records!(context, { filter, limit: 1, cursor: result.meta.nextCursor }));
    ids.push(...result.data.map((row) => row.id));
    expect(result.aggregate.balance).toBe(14);
  }
  expect(new Set(ids).size).toBe(3);
  expect(ids).toEqual(expect.arrayContaining([`adjustment:${sharedId}`, `redemption:${sharedId}`]));
  await expect(giftWorkspaceSource.records!(context, { filter, limit: 1, cursor: 'adjustment:future-adjustment' }))
    .rejects.toMatchObject({ statusCode: 404 });
  await expect(giftWorkspaceSource.records!(context, { filter, limit: 1, cursor: 'adjustment:practice-adjustment' }))
    .rejects.toMatchObject({ statusCode: 404 });
  expect((await listGifts({ ...fixture.scope, rehearsal: false, asOf: FROZEN_NOW }))[0]?.remaining).toBe(14);
  const detail = EntityResponse.parse(await giftWorkspaceSource.entity(context, { kind: 'gift', id: gift.id }));
  expect(detail.fields).toContainEqual({ label: 'Live remaining', value: 14, format: 'number' });
  expect(detail.fields).toContainEqual({ label: 'Practice remaining', value: 53, format: 'number' });
  expect((await getLiveDashboard(fixture.scope, FROZEN_NOW, context)).gifts[0]?.remaining).toBe(14);
});

it('keeps redemption flags, retained voids and pool cursors exact without granting volunteers reporting authority', async () => {
  const gift = await rawDb.giftType.create({ data: { eventId: fixture.eventId, name: 'Flagged gift', initialStock: 10 } });
  const flagged = await redemption(gift.id, { flag: 'OVER_STOCK' });
  await redemption(gift.id);
  const voided = await redemption(gift.id, { flag: 'OVER_STOCK', voided: true });
  const practice = await redemption(gift.id, { flag: 'OVER_STOCK', rehearsal: true });
  const future = await redemption(gift.id, { flag: 'OVER_STOCK', at: SOURCE_FUTURE });
  const context = await fixture.reader(fixture.admin);
  const filter = { kind: 'redemptions' as const, giftTypeId: gift.id, flagged: true, rehearsal: false, asOf: FROZEN_NOW.toISOString() };
  const records = RecordsResponse.parse(await redemptionWorkspaceSource.records!(context, { filter, limit: 50 }));
  expect(records.aggregate).toEqual({ value: 1, unit: 'redemptions' });
  expect(records.data.map((row) => row.id)).toEqual([flagged.id]);
  for (const row of [voided, practice, future]) await expect(redemptionWorkspaceSource.records!(context,
    { filter, limit: 1, cursor: row.id })).rejects.toMatchObject({ statusCode: 404 });
  const retained = EntityResponse.parse(await redemptionWorkspaceSource.entity(context, { kind: 'redemption', id: voided.id }));
  expect(retained.actions).toEqual([]);
  await expect(giftWorkspaceSource.entity(await fixture.reader(fixture.volunteer), { kind: 'gift', id: gift.id }))
    .rejects.toMatchObject({ statusCode: 403 });
  await expect(cardWorkspaceSource.records!(await fixture.reader(fixture.volunteer), { filter: { kind: 'cards', stage: 'issued' }, limit: 50 }))
    .rejects.toMatchObject({ statusCode: 403 });
});

it('keeps unbounded gift history before the Unix epoch and applies an explicit lower bound only when selected', async () => {
  const gift = await rawDb.giftType.create({ data: { eventId: fixture.eventId, name: 'Historical ledger gift', initialStock: 10 } });
  const row = await rawDb.giftStockAdjustment.create({ data: { eventId: fixture.eventId, giftTypeId: gift.id,
    delta: 4, reason: 'Retained historical stock', createdById: fixture.admin.id, createdAt: new Date('1969-12-31T23:59:59.000Z') } });
  const context = await fixture.reader(fixture.admin);
  const filter = { kind: 'gift-ledger' as const, giftTypeId: gift.id, rehearsal: false, asOf: FROZEN_NOW.toISOString() };
  const all = RecordsResponse.parse(await giftWorkspaceSource.records!(context, { filter, limit: 10 }));
  expect(all.data.map((item) => item.id)).toEqual(['adjustment:' + row.id]);
  expect(all.aggregate).toMatchObject({ value: 4, balance: 14 });
  expect(all.meta.count).toBe(1);
  const selected = RecordsResponse.parse(await giftWorkspaceSource.records!(context,
    { filter: { ...filter, from: FROZEN_NOW.toISOString() }, limit: 10 }));
  expect(selected.data).toEqual([]);
  expect(selected.aggregate).toMatchObject({ value: 0, balance: 14 });
  expect(selected.meta.count).toBe(0);
});
