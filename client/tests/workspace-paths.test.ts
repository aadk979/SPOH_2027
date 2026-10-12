import { describe, expect, it } from 'vitest';
import { EntityKind, RecordsFilter, RecordsKind } from '@spoh/shared';
import { entityPath, recordsPath, searchPath, workspacePath } from '@/shared/lib/workspacePath';
import { entityFromParams, recordsFromParams, routeInput, searchFromParams } from '@/features/workspace/model/routeInput';
import { aggregateLabel, fieldValue, filterDescription } from '@/features/workspace/model/presentation';
import { cardStageLink, todayCardLink } from '@/features/dashboard/model/drillLinks';

describe('workspace routes preserve source intent', () => {
  it.each(EntityKind.options)('round-trips a scoped %s reference', (kind) => {
    const ref = { kind, id: 'item & / ? # 1' };
    expect(entityFromParams(new URLSearchParams(entityPath(ref).split('?')[1]))).toEqual(ref);
  });
  it('round-trips the persisted assignment relation without trusting a station hint', () => {
    const ref = { kind: 'person' as const, id: 'person-a', via: { kind: 'assignment' as const, assignmentId: 'assignment-a' } };
    expect(entityFromParams(new URLSearchParams(entityPath(ref).split('?')[1]))).toEqual(ref);
    expect(() => entityFromParams(new URLSearchParams('kind=person&id=person-a&stationId=other'))).toThrow();
    expect(() => entityFromParams(new URLSearchParams('kind=person&id=person-a&assignmentId=forged'))).toThrow();
  });
  it.each(RecordsKind.options)('accepts only the implemented %s filter branch', (kind) => {
    const input = kind === 'gift-ledger' ? { kind, giftTypeId: 'gift-a', rehearsal: false } : { kind };
    const request = recordsFromParams(new URLSearchParams(recordsPath(RecordsFilter.parse(input)).split('?')[1]));
    expect(request.filter).toEqual(input);
    expect(() => recordsFromParams(new URLSearchParams(`kind=${kind}&madeUpFilter=true`))).toThrow();
  });
  it('preserves false, category case, source and the exact cross-midnight window', () => {
    const filter = { kind: 'registrations' as const, categoryCode: 'MixedCase', source: 'APP' as const,
      includeRehearsal: false, voided: false, from: '2027-01-08T15:30:00.000Z', asOf: '2027-01-08T16:30:00.000Z' };
    expect(recordsFromParams(new URLSearchParams(recordsPath(filter).split('?')[1])).filter).toEqual(filter);
    expect(recordsPath(filter)).not.toContain('date=');
  });
  it.each(['issued', 'completed'] as const)('keeps a dashboard %s card at the exact inclusive observation boundary', (stage) => {
    const window = { date: '2027-01-09', from: '2027-01-08T16:00:00.000Z', asOf: '2027-01-09T02:00:00.000Z', includeRehearsal: false };
    const query = new URLSearchParams(todayCardLink(window, stage)!.split('?')[1]);
    expect(recordsFromParams(query).filter).toEqual({ kind: 'cards', from: window.from, asOf: window.asOf, includeRehearsal: false, stage });
    expect(query.has('to')).toBe(false);
    expect(query.has('date')).toBe(false);
  });
  it('preserves a Counts funnel end explicitly selected by the user', () => {
    const observation = { from: '2027-01-08T16:00:00.000Z', to: '2027-01-09T01:00:00.000Z', asOf: '2027-01-09T02:00:00.000Z', includeRehearsal: true };
    const query = new URLSearchParams(cardStageLink({ metric: 'station', stationId: 'station-a' }, observation)!.split('?')[1]);
    expect(recordsFromParams(query).filter).toEqual({ kind: 'cards', ...observation, stage: 'station', stationId: 'station-a' });
  });
  it('retains raw station codes distinct from reserved funnel stages', () => {
    const filter = { kind: 'cards' as const, stage: 'station' as const, stationCode: 'issued', includeRehearsal: false };
    expect(recordsFromParams(new URLSearchParams(recordsPath(filter).split('?')[1])).filter).toEqual(filter);
    expect(() => recordsPath({ kind: 'cards', stationCode: 'Issued' })).toThrow();
  });
  it.each(['kind=footfall&source=APP&source=PAPER', 'kind=footfall&limit=0',
    'kind=footfall&limit=201', 'kind=footfall&includeRehearsal=unknown',
    'kind=footfall&rehearsal=false&includeRehearsal=false', 'kind=incidents&giftTypeId=foreign'])('refuses ambiguous or ignored filters: %s', (query) => {
    expect(() => recordsFromParams(new URLSearchParams(query))).toThrow();
  });
  it('validates cursor/limit separately and keeps link paging out of source filters', () => {
    expect(recordsFromParams(new URLSearchParams('kind=footfall&limit=200&cursor=row-a'))).toEqual({ filter: { kind: 'footfall' }, limit: 200, cursor: 'row-a' });
    expect(() => recordsFromParams(new URLSearchParams('kind=footfall&cursor='))).toThrow();
  });
  it('encodes search text and rejects foreign query keys rather than ignoring them', () => {
    expect(searchFromParams(new URLSearchParams(searchPath('A & B').split('?')[1]))).toEqual({ query: 'A & B', limit: 20 });
    expect(searchFromParams(new URLSearchParams())).toBeNull();
    expect(() => searchFromParams(new URLSearchParams('query=a&foreignEventId=b'))).toThrow();
    expect(() => searchFromParams(new URLSearchParams('query=a&query=b'))).toThrow();
    expect(routeInput(() => { throw new Error('private body'); }).error?.message).not.toContain('private body');
  });
  it('builds reviewed action/platform paths only and distinguishes quantity from rows', () => {
    expect(workspacePath({ type: 'platform', path: '/events', eventId: 'evt-a' })).toBe('/events?eventId=evt-a');
    expect(workspacePath({ type: 'action', path: '/admin/corrections', query: { id: 'record/a' } })).toBe('/admin/corrections?id=record%2Fa');
    expect(aggregateLabel({ value: 240, unit: 'roomEntries' })).toBe('240 room entries');
    expect(aggregateLabel({ value: 2, unit: 'cards' })).toBe('2 distinct cards');
    expect(filterDescription({ kind: 'gift-ledger', giftTypeId: 'gift-a', rehearsal: false })).toContainEqual({ label: 'Rehearsal', value: 'No' });
    expect(fieldValue({ label: 'Absent', value: null, format: 'text' })).toBe('Not recorded');
    expect(fieldValue({ label: 'Value', value: false, format: 'boolean' })).toBe('No');
    expect(fieldValue({ label: 'Value', value: true, format: 'boolean' })).toBe('Yes');
    expect(fieldValue({ label: 'Value', value: 1200, format: 'number' })).toBe('1,200');
  });
});
