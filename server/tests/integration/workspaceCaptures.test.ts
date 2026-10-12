import { afterEach, beforeEach, expect, it } from 'vitest';
import { EntityResponse, RecordsResponse } from '@spoh/shared';
import { registrationWorkspaceSource } from '../../src/modules/registration/index.js';
import { footfallWorkspaceSource } from '../../src/modules/footfall/index.js';
import { useAuthorizer } from '../../src/platform/access/engine.js';
import { rawDb } from '../helpers/db.js';
import { idempotencyKey } from '../helpers/fixtures.js';
import { SOURCE_BEFORE, SOURCE_FUTURE, workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
import { FROZEN_NOW } from '../setup.js';

let fixture: WorkspaceFixture;
beforeEach(async () => { fixture = await workspaceFixture(); });
afterEach(() => useAuthorizer(null));

function registration(input: { at?: Date; rehearsal?: boolean; voided?: boolean; stationId?: string;
  source?: 'APP' | 'PAPER'; importBatchId?: string; missionCardId?: string; groupId?: string } = {}) {
  return rawDb.registration.create({ data: { eventId: fixture.eventId, stationId: input.stationId ?? fixture.first,
    categoryId: fixture.category.id, recordedById: fixture.volunteer.id, recordedByMembershipId: fixture.recorder.id,
    recordedAt: input.at ?? FROZEN_NOW, rehearsal: input.rehearsal ?? false, voided: input.voided ?? false,
    source: input.source ?? 'APP', idempotencyKey: idempotencyKey(),
    ...(input.importBatchId ? { importBatchId: input.importBatchId } : {}),
    ...(input.missionCardId ? { missionCardId: input.missionCardId } : {}), ...(input.groupId ? { groupId: input.groupId } : {}) } });
}

it('paginates the exact live registration dataset, including asOf and excluding explicit to', async () => {
  const older = await registration({ at: SOURCE_BEFORE });
  const boundary = await registration();
  const future = await registration({ at: SOURCE_FUTURE });
  const practice = await registration({ rehearsal: true });
  const paper = await registration({ source: 'PAPER' });
  const otherStation = await registration({ stationId: fixture.second });
  await registration({ voided: true });
  const context = await fixture.reader(fixture.admin);
  const filter = { kind: 'registrations' as const, stationId: fixture.first, categoryCode: 'SEC_4', source: 'APP' as const,
    rehearsal: false, from: SOURCE_BEFORE.toISOString(), asOf: FROZEN_NOW.toISOString() };
  const first = RecordsResponse.parse(await registrationWorkspaceSource.records!(context, { filter, limit: 1 }));
  expect(first.aggregate).toEqual({ value: 2, unit: 'registrations' });
  expect(first.meta.count).toBe(2);
  expect(first.data[0]?.id).toBe(boundary.id);
  const next = RecordsResponse.parse(await registrationWorkspaceSource.records!(context,
    { filter, limit: 1, cursor: first.meta.nextCursor! }));
  expect(next.data.map((row) => row.id)).toEqual([older.id]);
  expect(next.aggregate.value).toBe(2);
  for (const excluded of [future, practice, paper, otherStation]) {
    await expect(registrationWorkspaceSource.records!(context, { filter, limit: 1, cursor: excluded.id }))
      .rejects.toMatchObject({ statusCode: 404 });
  }
  const exclusive = RecordsResponse.parse(await registrationWorkspaceSource.records!(context,
    { filter: { ...filter, to: FROZEN_NOW.toISOString() }, limit: 50 }));
  expect(exclusive.data.map((row) => row.id)).toEqual([older.id]);
  expect(exclusive.aggregate.value).toBe(1);
});

it('sums room entries across full filtered pages without counting future, voided, practice or non-counting rows', async () => {
  const noncounting = await rawDb.station.create({ data: { eventId: fixture.eventId, code: 'NON_COUNTED', name: 'Not counted',
    typeId: (await rawDb.stationType.findFirstOrThrow({ where: { eventId: fixture.eventId, countsEntry: false } })).id } });
  const rows = [];
  for (const capture of [{ source: 'APP' as const, quantity: 2 }, { source: 'PAPER' as const, quantity: 3 },
    { source: 'FALLBACK_SHEET' as const, quantity: 7 }, { source: 'APP' as const, quantity: 100, rehearsal: true },
    { source: 'APP' as const, quantity: 200, recordedAt: SOURCE_FUTURE }, { source: 'APP' as const, quantity: 400, voided: true },
    { source: 'APP' as const, quantity: 1000, stationId: noncounting.id }]) {
    rows.push(await rawDb.footfallTick.create({ data: { eventId: fixture.eventId, stationId: fixture.first,
      recordedById: fixture.volunteer.id, recordedByMembershipId: fixture.recorder.id,
      recordedAt: FROZEN_NOW, idempotencyKey: idempotencyKey(), ...capture } }));
  }
  const context = await fixture.reader(fixture.admin);
  const filter = { kind: 'footfall' as const, countedStationsOnly: true, asOf: FROZEN_NOW.toISOString() };
  const first = RecordsResponse.parse(await footfallWorkspaceSource.records!(context, { filter, limit: 1 }));
  expect(first.aggregate).toEqual({ value: 12, unit: 'roomEntries' });
  expect(first.meta.count).toBe(3);
  expect(first.data).toHaveLength(1);
  const next = RecordsResponse.parse(await footfallWorkspaceSource.records!(context,
    { filter, limit: 1, cursor: first.meta.nextCursor! }));
  expect(next.aggregate.value).toBe(12);
  expect(next.data[0]?.id).not.toBe(first.data[0]?.id);
  const inclusive = RecordsResponse.parse(await footfallWorkspaceSource.records!(context,
    { filter: { ...filter, includeRehearsal: true }, limit: 50 }));
  expect(inclusive.aggregate.value).toBe(112);
  for (const row of rows.slice(3)) await expect(footfallWorkspaceSource.records!(context,
    { filter, limit: 1, cursor: row.id })).rejects.toMatchObject({ statusCode: 404 });
});

it('allows foreign-station IC counts but refuses its private recorder filter and volunteer count access', async () => {
  const row = await registration({ stationId: fixture.second });
  const context = await fixture.reader(fixture.ic);
  const records = RecordsResponse.parse(await registrationWorkspaceSource.records!(context,
    { filter: { kind: 'registrations', stationId: fixture.second }, limit: 50 }));
  expect(records.aggregate.value).toBe(1);
  expect(records.data[0]?.related.some((link) => link.destination.type === 'entity' && link.destination.target.kind === 'person')).toBe(false);
  expect(JSON.stringify(records)).not.toContain(fixture.volunteer.email);
  await expect(registrationWorkspaceSource.records!(context,
    { filter: { kind: 'registrations', stationId: fixture.second, personId: fixture.volunteer.id }, limit: 50 }))
    .rejects.toMatchObject({ statusCode: 403 });
  await expect(registrationWorkspaceSource.entity(await fixture.reader(fixture.volunteer), { kind: 'registration', id: row.id }))
    .rejects.toMatchObject({ statusCode: 403 });
});

it('links capture provenance only with current import authority and keeps card and group predicates exact', async () => {
  const batch = await rawDb.importBatch.create({ data: { eventId: fixture.eventId, targetTable: 'Registration', source: 'PAPER',
    rowCount: 1, provenanceVersion: 1, importedById: fixture.admin.id, importedAt: FROZEN_NOW } });
  const card = await rawDb.missionCard.create({ data: { eventId: fixture.eventId, shortCode: 'CAPTUR', qrPayload: 'private-capture-qr' } });
  const row = await registration({ importBatchId: batch.id, missionCardId: card.id, groupId: 'capture-group' });
  await registration({ groupId: 'other-group' });
  const admin = await fixture.reader(fixture.admin);
  const detail = EntityResponse.parse(await registrationWorkspaceSource.entity(admin, { kind: 'registration', id: row.id }));
  expect(detail.related).toContainEqual(expect.objectContaining({ destination: { type: 'entity', target: { kind: 'import', id: batch.id } } }));
  expect(detail.related).toContainEqual(expect.objectContaining({ destination: { type: 'entity', target: { kind: 'card', id: card.id } } }));
  const records = RecordsResponse.parse(await registrationWorkspaceSource.records!(admin,
    { filter: { kind: 'registrations', importBatchId: batch.id, cardId: card.id, groupId: 'capture-group' }, limit: 50 }));
  expect(records.data.map((capture) => capture.id)).toEqual([row.id]);
  expect(records.aggregate.value).toBe(1);
  expect(JSON.stringify(records)).not.toContain('private-capture-qr');
  const limited = EntityResponse.parse(await registrationWorkspaceSource.entity(await fixture.reader(fixture.ic), { kind: 'registration', id: row.id }));
  expect(limited.related.some((link) => link.destination.type === 'entity' && link.destination.target.kind === 'import')).toBe(false);
});
