import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfirmOutboxSalvageResponse, UndoCaptureImportResponse, VoidGiftRedemptionResponse } from '@spoh/shared';
import { createApp } from '../../src/app/createApp.js';
import { useAuthorizer } from '../../src/platform/access/engine.js';
import { LocalCedarAuthorizer } from '../../src/platform/access/authorizer/index.js';
import { rawDb, resetDatabase } from '../helpers/db.js';
import { bearer, categoryId, createStation, createVolunteer, idempotencyKey, testEvent, type TestVolunteer } from '../helpers/fixtures.js';
import { FROZEN_NOW } from '../setup.js';

const app = createApp();
let chief: TestVolunteer;
let volunteer: TestVolunteer;
let eventId: string;
let stationId: string;
beforeEach(async () => {
  useAuthorizer(null);
  await resetDatabase();
  eventId = (await testEvent()).eventId;
  chief = await createVolunteer({ email: 'retained-chief@example.test', role: 'CHIEF_COORDINATOR' });
  volunteer = await createVolunteer({ email: 'retained-volunteer@example.test', role: 'VOLUNTEER' });
  stationId = (await createStation({ code: 'RETAINED', countsEntry: true })).id;
});
afterEach(() => useAuthorizer(null));
const post = (path: string, body: object, actor = chief) => request(app).post(`/api/v1${path}`).set('Authorization', bearer(actor)).send(body);
const reason = 'Reconciled against retained operational records';
async function importRows(kind: 'registrations' | 'footfall', extra: object = {}) {
  return post(`/fallback/imports/${kind}`, { commit: true, source: 'PAPER', fileName: 'retained.csv',
    rows: kind === 'registrations' ? [{ category: 'SEC_1', stationCode: 'RETAINED', recordedAt: FROZEN_NOW.toISOString(), count: 2 }]
      : [{ stationCode: 'RETAINED', timeBlockStart: FROZEN_NOW.toISOString(), quantity: 7 }], ...extra });
}

describe('exact retained import undo', () => {
  it.each(['registrations', 'footfall'] as const)('owns only newly inserted %s and retains duplicate/manual-void history', async (kind) => {
    const imported = await importRows(kind);
    expect(imported.status).toBe(201);
    const batchId = imported.body.importBatchId as string;
    const duplicate = await importRows(kind);
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.recordsCreated).toBe(0);
    const rows = kind === 'registrations'
      ? await rawDb.registration.findMany({ where: { eventId, importBatchId: batchId }, orderBy: { id: 'asc' } })
      : await rawDb.footfallTick.findMany({ where: { eventId, importBatchId: batchId }, orderBy: { id: 'asc' } });
    expect(rows.length).toBe(kind === 'registrations' ? 2 : 1);
    expect(await rawDb.importBatch.findUnique({ where: { id: batchId } })).toMatchObject({ provenanceVersion: 1, rowCount: rows.length });
    if (kind === 'registrations') await rawDb.registration.update({ where: { id: rows[0]!.id }, data: { voided: true, voidedReason: 'Earlier manual correction' } });
    const body = { idempotencyKey: idempotencyKey(), reason };
    const undone = await post(`/fallback/imports/${batchId}/undo`, body);
    expect(undone.status).toBe(200);
    expect(UndoCaptureImportResponse.parse(undone.body)).toEqual({ importBatchId: batchId,
      voided: 1, alreadyVoided: kind === 'registrations' ? 1 : 0, retained: rows.length });
    expect((await post(`/fallback/imports/${batchId}/undo`, body)).body).toEqual(undone.body);
    expect((await post(`/fallback/imports/${batchId}/undo`, { ...body, idempotencyKey: idempotencyKey() })).status).toBe(409);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'import.undo', entityId: batchId } })).toBe(1);
    expect(await rawDb.importBatch.findUnique({ where: { id: batchId } })).toMatchObject({ undoneAt: FROZEN_NOW, undoReason: reason });
    if (kind === 'registrations') expect(await rawDb.registration.findUnique({ where: { id: rows[0]!.id } })).toMatchObject({ voidedReason: 'Earlier manual correction', importBatchId: batchId });
    const untouched = await rawDb.importBatch.findUnique({ where: { id: duplicate.body.importBatchId as string } });
    expect(untouched).toMatchObject({ rowCount: 0, undoneAt: null });
  });
  it.each([{ targetTable: 'Registration', provenanceVersion: 0 }, { targetTable: 'Roster', provenanceVersion: 0 }])('refuses unproved/roster ownership %j', async (shape) => {
    const batch = await rawDb.importBatch.create({ data: { eventId, importedById: chief.id, source: 'PAPER', rowCount: 0, ...shape } });
    expect((await post(`/fallback/imports/${batch.id}/undo`, { idempotencyKey: idempotencyKey(), reason })).status).toBe(409);
    expect(await rawDb.importBatch.findUnique({ where: { id: batch.id } })).toMatchObject({ undoneAt: null });
  });
  it('rolls back every row, audit and receipt when one retained row loses authority', async () => {
    const imported = await importRows('registrations');
    expect(imported.status).toBe(201);
    const batchId = imported.body.importBatchId as string;
    const rows = await rawDb.registration.findMany({ where: { eventId, importBatchId: batchId }, orderBy: { id: 'asc' } });
    const cedar = new LocalCedarAuthorizer();
    useAuthorizer({ batch: (questions) => cedar.batch(questions), isAuthorized: async (question) => {
      const decision = await cedar.isAuthorized(question);
      return question.action === 'Record.Void' && question.resource.id === rows[1]!.id
        ? { ...decision, allowed: false, determiningPolicies: [], errors: [] } : decision;
    } });
    const key = idempotencyKey();
    expect((await post(`/fallback/imports/${batchId}/undo`, { idempotencyKey: key, reason })).status).toBe(403);
    expect(await rawDb.registration.count({ where: { eventId, importBatchId: batchId, voided: true } })).toBe(0);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'import.undo' } })).toBe(0);
    expect(await rawDb.idempotencyRecord.findUnique({ where: { key } })).toBeNull();
  });
  it('refuses a forged batch row count and archive writes without losing rows', async () => {
    const imported = await importRows('footfall');
    const batchId = imported.body.importBatchId as string;
    await rawDb.importBatch.update({ where: { id: batchId }, data: { rowCount: 2 } });
    expect((await post(`/fallback/imports/${batchId}/undo`, { idempotencyKey: idempotencyKey(), reason })).status).toBe(409);
    await rawDb.event.update({ where: { id: eventId }, data: { status: 'ARCHIVED' } });
    const archiveKey = idempotencyKey();
    const refused = await post(`/fallback/imports/${batchId}/undo`, { idempotencyKey: archiveKey, reason });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({ code: 'CONFLICT', message: 'Archived imports cannot be undone.' });
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'import.undo' } })).toBe(0);
    expect(await rawDb.idempotencyRecord.findUnique({ where: { key: archiveKey } })).toBeNull();
    expect(await rawDb.footfallTick.count({ where: { eventId, importBatchId: batchId, voided: false } })).toBe(1);
  });
});

describe('retained redemption correction', () => {
  async function seed() {
    const gift = await rawDb.giftType.create({ data: { eventId, name: 'Badge', initialStock: 10, rehearsalInitialStock: 4, lowStockThreshold: 1 } });
    const card = await rawDb.missionCard.create({ data: { eventId, shortCode: 'ABC123', qrPayload: 'synthetic-private-qr', status: 'LOST' } });
    const recordedByMembershipId = (await rawDb.eventMembership.findFirstOrThrow({ where: { eventId, personId: chief.id } })).id;
    const live = await rawDb.giftRedemption.create({ data: { eventId, recordedByMembershipId, giftTypeId: gift.id, missionCardId: card.id, stationId, recordedById: chief.id, idempotencyKey: idempotencyKey() } });
    const practice = await rawDb.giftRedemption.create({ data: { eventId, recordedByMembershipId, giftTypeId: gift.id, stationId, recordedById: chief.id, idempotencyKey: idempotencyKey(), rehearsal: true } });
    return { gift, card, live, practice };
  }
  it('restores only the written pool and never rewrites a lost card or duplicate audit', async () => {
    const { card, live, practice } = await seed();
    const body = { idempotencyKey: idempotencyKey(), reason };
    const corrected = await post(`/gifts/redemptions/${practice.id}/void`, body);
    expect(corrected.status).toBe(200);
    expect(VoidGiftRedemptionResponse.parse(corrected.body)).toMatchObject({ id: practice.id, voided: true, giftType: { remaining: 4, redeemed: 0 } });
    expect((await post(`/gifts/redemptions/${practice.id}/void`, body)).body).toEqual(corrected.body);
    expect(await rawDb.giftRedemption.findUnique({ where: { id: practice.id } })).toMatchObject({ voided: true, voidedAt: FROZEN_NOW, voidedReason: reason });
    expect(await rawDb.giftRedemption.findUnique({ where: { id: live.id } })).toMatchObject({ voided: false });
    expect(await rawDb.missionCard.findUnique({ where: { id: card.id } })).toMatchObject({ status: 'LOST' });
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'gift.void', entityId: practice.id } })).toBe(1);
    expect((await post(`/gifts/redemptions/${practice.id}/void`, { ...body, idempotencyKey: idempotencyKey() })).status).toBe(409);
  });
  it('serializes two correction requests and refuses volunteers or revoked callers', async () => {
    const { live } = await seed();
    expect((await post(`/gifts/redemptions/${live.id}/void`, { idempotencyKey: idempotencyKey(), reason }, volunteer)).status).toBe(403);
    const results = await Promise.all([1, 2].map(() => post(`/gifts/redemptions/${live.id}/void`, { idempotencyKey: idempotencyKey(), reason })));
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    await rawDb.eventMembership.updateMany({ where: { eventId, personId: chief.id }, data: { status: 'DEACTIVATED' } });
    expect((await post(`/gifts/redemptions/${live.id}/void`, { idempotencyKey: idempotencyKey(), reason })).status).toBe(403);
  });
});

describe('audited parked queue salvage', () => {
  async function entry() {
    const key = idempotencyKey();
    const row = await rawDb.registration.create({ data: { eventId, stationId, recordedById: volunteer.id,
      categoryId: await categoryId('SEC_1'), idempotencyKey: key, recordedAt: FROZEN_NOW } });
    return { idempotencyKey: key, captureKind: 'registration' as const, recordId: row.id };
  }
  it('confirms exact original keys only for their retained person/event and replays one audit', async () => {
    const capture = await entry();
    const body = { idempotencyKey: idempotencyKey(), reason, entries: [capture] };
    const response = await post('/fallback/salvage/confirm', body, volunteer);
    expect(response.status).toBe(200);
    const confirmed = ConfirmOutboxSalvageResponse.parse(response.body);
    expect(confirmed).toMatchObject({ eventId, personId: volunteer.id, confirmedKeys: [capture.idempotencyKey] });
    expect((await post('/fallback/salvage/confirm', body, volunteer)).body).toEqual(response.body);
    expect(await rawDb.auditLog.findUnique({ where: { id: confirmed.auditId } })).toMatchObject({ action: 'outbox.salvage.confirm', actorId: volunteer.id });
    expect(await rawDb.registration.count({ where: { id: capture.recordId } })).toBe(1);
  });
  it('keeps mixed invalid selections unconfirmed and refuses borrowed owners, wrong UUIDs and unsupported groups', async () => {
    const capture = await entry();
    for (const entries of [[capture], [capture, { ...capture, idempotencyKey: idempotencyKey(), recordId: 'missing' }], [{ ...capture, idempotencyKey: idempotencyKey() }]]) {
      const actor = entries.length === 1 && entries[0]!.idempotencyKey === capture.idempotencyKey ? chief : volunteer;
      expect((await post('/fallback/salvage/confirm', { idempotencyKey: idempotencyKey(), reason, entries }, actor)).status).toBe(409);
    }
    expect((await post('/fallback/salvage/confirm', { idempotencyKey: idempotencyKey(), reason, entries: [{ ...capture, captureKind: 'group' }] }, volunteer)).status).toBe(400);
    expect(await rawDb.auditLog.count({ where: { eventId, action: 'outbox.salvage.confirm' } })).toBe(0);
  });
});
