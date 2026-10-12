import { describe, expect, it } from 'vitest';
import { EntityQuery, RecordsQuery, SearchQuery } from './queries.js';
import { RecordsFilter } from './records.js';
import { WorkspaceDestination } from './destinations.js';
import { ConfirmOutboxSalvageRequest, UndoCaptureImportRequest } from '../fallback/index.js';

describe('strict workspace transport', () => {
  it('retains exact false predicates and observation instants from URL values', () => {
    expect(RecordsQuery.parse({ kind: 'footfall', rehearsal: 'false', voided: 'false',
      countedStationsOnly: 'false', asOf: '2026-10-11T08:00:00.000Z', limit: '1' })).toEqual({
      filter: { kind: 'footfall', rehearsal: false, voided: false, countedStationsOnly: false,
        asOf: '2026-10-11T08:00:00.000Z' }, limit: 1 });
  });
  it.each([
    { kind: 'footfall', rehearsal: 'yes' }, { kind: 'footfall', limit: '201' },
    { kind: 'footfall', limit: 'NaN' }, { kind: 'footfall', stationId: ['a', 'b'] },
    { kind: 'footfall', unexpected: 'ignored' }, { kind: 'people', source: 'APP' },
  ])('rejects unsupported or repeated query predicates %j', (query) => {
    expect(RecordsQuery.safeParse(query).success).toBe(false);
  });
  it('accepts only paired assignment relations on supported homes', () => {
    expect(EntityQuery.parse({ kind: 'person', id: 'person', via: 'assignment', assignmentId: 'assignment' }))
      .toEqual({ kind: 'person', id: 'person', via: { kind: 'assignment', assignmentId: 'assignment' } });
    for (const query of [{ kind: 'person', id: 'person', via: 'assignment' },
      { kind: 'person', id: 'person', assignmentId: 'assignment' },
      { kind: 'gift', id: 'gift', via: 'assignment', assignmentId: 'assignment' }])
      expect(EntityQuery.safeParse(query).success).toBe(false);
  });
  it('rejects ambiguous observation, pool, stage and gap combinations', () => {
    for (const filter of [
      { kind: 'cards', stationId: 'station' }, { kind: 'cards', stage: 'station' },
      { kind: 'footfall', rehearsal: false, includeRehearsal: false },
      { kind: 'footfall', from: '2026-10-11T08:00:00Z', to: '2026-10-11T08:00:00Z' },
      { kind: 'assignments', coverageGap: true, checkedIn: false },
      { kind: 'incidents', open: true, status: 'OPEN' },
    ]) expect(RecordsFilter.safeParse(filter).success).toBe(false);
    expect(RecordsFilter.safeParse({ kind: 'assignments', coverageGap: true, running: true, shiftId: 'shift' }).success).toBe(true);
    expect(SearchQuery.parse({ query: '  card  ' })).toEqual({ query: 'card', limit: 20 });
    expect(SearchQuery.safeParse({ query: '', limit: 51 }).success).toBe(false);
  });
  it('allows only reviewed application destinations and safe action parameters', () => {
    expect(WorkspaceDestination.safeParse({ type: 'action', path: '/admin/cards', query: { cardId: 'card' } }).success).toBe(true);
    expect(WorkspaceDestination.safeParse({ type: 'action', path: 'https://outside.example.test' }).success).toBe(false);
    expect(WorkspaceDestination.safeParse({ type: 'action', path: '/admin/cards', query: { qrPayload: 'secret' } }).success).toBe(false);
  });
  it('retains source-qualified ledger cursors without widening entity identifiers', () => {
    const recordId = 'r'.repeat(64);
    const cursor = `redemption:${recordId}`;
    expect(RecordsQuery.parse({ kind: 'gift-ledger', giftTypeId: 'gift', rehearsal: 'false', cursor }))
      .toMatchObject({ cursor, filter: { rehearsal: false } });
    expect(RecordsQuery.safeParse({ kind: 'gift-ledger', giftTypeId: 'gift', rehearsal: 'false', cursor: 'r'.repeat(161) }).success).toBe(false);
    expect(EntityQuery.safeParse({ kind: 'redemption', id: cursor }).success).toBe(false);
    expect(RecordsQuery.parse({ kind: 'registrations', cardId: recordId })).toMatchObject({ filter: { cardId: recordId } });
    expect(RecordsQuery.safeParse({ kind: 'footfall', cardId: recordId }).success).toBe(false);
  });
  it('requires a reason and unique retained original UUIDs for salvage', () => {
    const idempotencyKey = '11111111-1111-4111-8111-111111111111';
    const entry = { idempotencyKey: '22222222-2222-4222-8222-222222222222', captureKind: 'footfall', recordId: 'record' };
    expect(ConfirmOutboxSalvageRequest.safeParse({ idempotencyKey, reason: 'Confirmed on server', entries: [entry] }).success).toBe(true);
    expect(ConfirmOutboxSalvageRequest.safeParse({ idempotencyKey, reason: 'Confirmed on server', entries: [entry, entry] }).success).toBe(false);
    expect(ConfirmOutboxSalvageRequest.safeParse({ idempotencyKey, reason: '', entries: [entry] }).success).toBe(false);
    expect(ConfirmOutboxSalvageRequest.safeParse({ idempotencyKey, reason: 'Reviewed', entries: [{ ...entry, captureKind: 'group' }] }).success).toBe(false);
    expect(UndoCaptureImportRequest.safeParse({ idempotencyKey, reason: ' ' }).success).toBe(false);
  });
});
