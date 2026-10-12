import { afterEach, beforeEach, expect, it } from 'vitest';
import { EntityResponse, RecordsResponse } from '@spoh/shared';
import { fallbackWorkspaceSource, importWorkspaceSource } from '../../src/modules/fallback/index.js';
import { footfallWorkspaceSource } from '../../src/modules/footfall/index.js';
import { getFunnel } from '../../src/modules/missionCard/index.js';
import { useAuthorizer } from '../../src/platform/access/engine.js';
import { rawDb } from '../helpers/db.js';
import { idempotencyKey, membershipOf } from '../helpers/fixtures.js';
import { SOURCE_BEFORE, SOURCE_FUTURE, workspaceFixture, type WorkspaceFixture } from '../helpers/workspace.js';
import { FROZEN_NOW } from '../setup.js';

let fixture: WorkspaceFixture;
beforeEach(async () => { fixture = await workspaceFixture(); });
afterEach(() => useAuthorizer(null));

function window(input: { startedAt?: Date; rehearsal?: boolean; stationId?: string; endedAt?: Date } = {}) {
  return rawDb.fallbackWindow.create({ data: { eventId: fixture.eventId, tier: 3, reason: 'Network outage',
    declaredById: fixture.admin.id, startedAt: input.startedAt ?? FROZEN_NOW,
    ...(input.rehearsal !== undefined ? { rehearsal: input.rehearsal } : {}),
    ...(input.stationId ? { stationId: input.stationId } : {}), ...(input.endedAt ? { endedAt: input.endedAt } : {}) } });
}
function batch(input: { targetTable?: string; importedAt?: Date; provenanceVersion?: number; rowCount?: number;
  fallbackWindowId?: string } = {}) {
  return rawDb.importBatch.create({ data: { eventId: fixture.eventId, source: 'FALLBACK_SHEET',
    targetTable: input.targetTable ?? 'Registration', importedById: fixture.admin.id,
    importedAt: input.importedAt ?? FROZEN_NOW, rowCount: input.rowCount ?? 1,
    provenanceVersion: input.provenanceVersion ?? 0, ...(input.fallbackWindowId ? { fallbackWindowId: input.fallbackWindowId } : {}) } });
}

it('keeps fallback aggregates and cursors on the requested live/open/station/time intersection', async () => {
  const global = await window({ startedAt: SOURCE_BEFORE });
  const station = await window({ stationId: fixture.first });
  const other = await window({ stationId: fixture.second });
  const practice = await window({ rehearsal: true });
  const future = await window({ startedAt: SOURCE_FUTURE });
  const closed = await window({ endedAt: FROZEN_NOW });
  const context = await fixture.reader(fixture.admin);
  const filter = { kind: 'fallback' as const, stationId: fixture.first, open: true,
    rehearsal: false, asOf: FROZEN_NOW.toISOString() };
  const first = RecordsResponse.parse(await fallbackWorkspaceSource.records!(context, { filter, limit: 1 }));
  expect(first.aggregate).toEqual({ value: 2, unit: 'windows' });
  expect(first.data[0]?.id).toBe(station.id);
  const next = RecordsResponse.parse(await fallbackWorkspaceSource.records!(context, { filter, limit: 1, cursor: first.meta.nextCursor! }));
  expect(next.data.map((row) => row.id)).toEqual([global.id]);
  for (const excluded of [other, practice, future, closed]) await expect(fallbackWorkspaceSource.records!(context,
    { filter, limit: 1, cursor: excluded.id })).rejects.toMatchObject({ statusCode: 404 });
  await expect(fallbackWorkspaceSource.records!(await fixture.reader(fixture.volunteer), { filter, limit: 1 }))
    .rejects.toMatchObject({ statusCode: 403 });
});

it('shares the snapshot and rehearsal pool with fallback caveats in the card funnel', async () => {
  await window({ startedAt: SOURCE_FUTURE });
  await window({ rehearsal: true });
  expect((await getFunnel(fixture.scope, {}, FROZEN_NOW)).containsFallbackData).toBe(false);
  expect((await getFunnel({ ...fixture.scope, includeRehearsal: true }, {}, FROZEN_NOW)).containsFallbackData).toBe(true);
  await window({ startedAt: FROZEN_NOW });
  expect((await getFunnel(fixture.scope, {}, FROZEN_NOW)).containsFallbackData).toBe(true);
});

it('applies every import history filter to both cursor anchors and complete aggregate counts', async () => {
  const fallback = await window();
  const older = await batch({ importedAt: SOURCE_BEFORE, fallbackWindowId: fallback.id });
  const current = await batch({ fallbackWindowId: fallback.id });
  const future = await batch({ importedAt: SOURCE_FUTURE, fallbackWindowId: fallback.id });
  const footfall = await batch({ targetTable: 'FootfallTick', fallbackWindowId: fallback.id });
  const unlinked = await batch();
  const context = await fixture.reader(fixture.admin);
  const filter = { kind: 'imports' as const, importType: 'REGISTRATION' as const, fallbackWindowId: fallback.id,
    personId: fixture.admin.id, asOf: FROZEN_NOW.toISOString() };
  const first = RecordsResponse.parse(await importWorkspaceSource.records!(context, { filter, limit: 1 }));
  expect(first.aggregate).toEqual({ value: 2, unit: 'imports' });
  expect(first.data[0]?.id).toBe(current.id);
  expect(first.meta.count).toBe(2);
  const next = RecordsResponse.parse(await importWorkspaceSource.records!(context, { filter, limit: 1, cursor: first.meta.nextCursor! }));
  expect(next.data.map((row) => row.id)).toEqual([older.id]);
  for (const excluded of [future, footfall, unlinked]) await expect(importWorkspaceSource.records!(context,
    { filter, limit: 1, cursor: excluded.id })).rejects.toMatchObject({ statusCode: 404 });
  await expect(importWorkspaceSource.entity(await fixture.reader(fixture.ic), { kind: 'import', id: current.id }))
    .rejects.toMatchObject({ statusCode: 403 });
});

it('links exact retained import rows and their proven window but leaves legacy and roster undo unavailable', async () => {
  const fallback = await window();
  const exact = await batch({ targetTable: 'FootfallTick', provenanceVersion: 1, fallbackWindowId: fallback.id });
  const capture = await rawDb.footfallTick.create({ data: { eventId: fixture.eventId, stationId: fixture.first,
    recordedById: fixture.admin.id, recordedByMembershipId: (await membershipOf(fixture.admin.id)).id,
    recordedAt: FROZEN_NOW, importBatchId: exact.id, source: 'FALLBACK_SHEET',
    quantity: 3, idempotencyKey: idempotencyKey() } });
  const legacy = await batch();
  const roster = await batch({ targetTable: 'Roster', provenanceVersion: 1 });
  const unmatched = await batch({ provenanceVersion: 1 });
  const context = await fixture.reader(fixture.admin);
  const detail = EntityResponse.parse(await importWorkspaceSource.entity(context, { kind: 'import', id: exact.id }));
  expect(detail.related).toContainEqual(expect.objectContaining({ destination: { type: 'entity', target: { kind: 'fallback', id: fallback.id } } }));
  expect(detail.related).toContainEqual(expect.objectContaining({ destination: { type: 'records',
    filter: { kind: 'footfall', importBatchId: exact.id, rehearsal: false } } }));
  expect(detail.actions).toContainEqual(expect.objectContaining({ destination: { type: 'action', path: '/chief/imports', query: { id: exact.id } } }));
  const records = RecordsResponse.parse(await footfallWorkspaceSource.records!(context,
    { filter: { kind: 'footfall', importBatchId: exact.id }, limit: 1 }));
  expect(records.data.map((row) => row.id)).toEqual([capture.id]);
  expect(records.aggregate).toEqual({ value: 3, unit: 'roomEntries' });
  expect(records.data[0]?.related).toContainEqual(expect.objectContaining({ destination: { type: 'entity', target: { kind: 'import', id: exact.id } } }));
  for (const unsupported of [legacy, roster, unmatched]) {
    const unavailable = EntityResponse.parse(await importWorkspaceSource.entity(context, { kind: 'import', id: unsupported.id }));
    expect(unavailable.actions).toEqual([]);
    expect(unavailable.facets).toContainEqual(expect.objectContaining({ name: 'Undo', availability: 'unavailable' }));
  }
});
