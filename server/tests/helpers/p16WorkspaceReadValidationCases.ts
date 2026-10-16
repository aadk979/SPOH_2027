export type WorkspaceRoute = 'entity' | 'records' | 'search';
export type WorkspaceQuery = Record<string, string | string[]>;
export interface WorkspaceInvalidQuery {
  id: string;
  route: WorkspaceRoute;
  query: WorkspaceQuery;
}
export interface WorkspaceValidationInput {
  stationId: string;
  giftTypeId: string;
  assignmentId: string;
  personId: string;
  now: string;
}
/** Pure URL query candidates. No provider, HTTP, database, clock or fixture mutations. */
export function workspaceReadValidationCases({
  stationId,
  giftTypeId,
  assignmentId,
  personId,
  now,
}: WorkspaceValidationInput) {
  const invalid: WorkspaceInvalidQuery[] = [],
    valid: Array<{ route: WorkspaceRoute; query: WorkspaceQuery }> = [];
  const add = (route: WorkspaceRoute, id: string, query: WorkspaceQuery) =>
    invalid.push({ id: route + ':' + id, route, query });
  const entity = { kind: 'station', id: stationId },
    search = { query: 'Synthetic P16' },
    records = { kind: 'footfall', rehearsal: 'false' };
  for (const [route, base, required] of [
    ['entity', entity, ['kind', 'id']],
    ['search', search, ['query']],
    ['records', records, ['kind']],
  ] as const) {
    const baseInput: WorkspaceQuery = base;
    for (const key of required) {
      const query: WorkspaceQuery = { ...base };
      delete query[key];
      add(route, 'missing:' + key, query);
      add(route, 'empty:' + key, { ...base, [key]: '' });
      add(route, 'repeated:' + key, {
        ...base,
        [key]: [String(baseInput[key]), String(baseInput[key])],
      });
    }
    add(route, 'unknown-key', { ...base, unexpected: 'true' });
  }
  for (const kind of ['unsupported', 'STATION', ' station', 'station '])
    add('entity', 'unsupported-kind:' + JSON.stringify(kind), { ...entity, kind });
  add('entity', 'id-too-long', { ...entity, id: 'x'.repeat(65) });
  add('entity', 'relation-without-id', { ...entity, via: 'assignment' });
  add('entity', 'relation-id-without-kind', { ...entity, assignmentId });
  add('entity', 'unsupported-relation', { ...entity, via: 'person', assignmentId });
  add('entity', 'relation-wrong-entity-kind', { ...entity, via: 'assignment', assignmentId });
  add('entity', 'relation-id-too-long', {
    kind: 'person',
    id: personId,
    via: 'assignment',
    assignmentId: 'x'.repeat(65),
  });
  for (const [route, maximum] of [
    ['records', 200],
    ['search', 50],
  ] as const)
    for (const value of ['0', '-1', String(maximum + 1), '1.5', 'NaN', 'Infinity', 'abc'])
      add(route, 'invalid-limit:' + value, {
        ...(route === 'records' ? records : search),
        limit: value,
      });
  add('search', 'trimmed-empty', { query: '   ' });
  add('search', 'query-too-long', { query: 'x'.repeat(121) });
  add('search', 'repeated-limit', { ...search, limit: ['1', '2'] });
  add('records', 'cursor-empty', { ...records, cursor: '' });
  add('records', 'cursor-too-long', { ...records, cursor: 'x'.repeat(161) });
  add('records', 'cursor-repeated', { ...records, cursor: ['one', 'two'] });
  add('records', 'unsupported-kind', { kind: 'unsupported' });
  add('records', 'unsupported-person-predicate', { kind: 'people', source: 'APP' });
  for (const [kind, field] of [
    ['registrations', 'rehearsal'],
    ['footfall', 'countedStationsOnly'],
    ['cards', 'includeRehearsal'],
    ['stamps', 'excludeLost'],
    ['redemptions', 'flagged'],
    ['incidents', 'open'],
    ['assignments', 'running'],
    ['assignments', 'checkedIn'],
    ['assignments', 'checkedOut'],
    ['assignments', 'coverageGap'],
    ['fallback', 'open'],
  ] as const)
    for (const value of ['yes', '1', 'TRUE', 'null'])
      add('records', 'invalid-boolean:' + kind + ':' + field + ':' + value, {
        kind,
        [field]: value,
      });
  for (const kind of [
    'registrations',
    'footfall',
    'cards',
    'stamps',
    'redemptions',
    'incidents',
    'lost-person',
    'lost-found',
    'fallback',
  ])
    add('records', 'conflicting-pools:' + kind, {
      kind,
      rehearsal: 'false',
      includeRehearsal: 'true',
    });
  for (const kind of [
    'registrations',
    'footfall',
    'cards',
    'stamps',
    'redemptions',
    'incidents',
    'lost-person',
    'lost-found',
    'announcements',
    'imports',
    'fallback',
    'gift-ledger',
    'audit',
  ]) {
    const base = { kind, ...(kind === 'gift-ledger' ? { giftTypeId, rehearsal: 'false' } : {}) };
    add('records', 'equal-time-range:' + kind, { ...base, from: now, to: now });
    add('records', 'malformed-time:' + kind, { ...base, from: 'not-a-date' });
  }
  add('records', 'station-without-card-stage', { kind: 'cards', stationId });
  add('records', 'station-card-stage-without-station', { kind: 'cards', stage: 'station' });
  add('records', 'incident-exact-and-open', {
    kind: 'incidents',
    status: 'RESOLVED',
    open: 'false',
  });
  const coverageConflicts: WorkspaceQuery[] = [
    { personId },
    { checkedIn: 'false' },
    { checkedOut: 'false' },
    { running: 'false' },
  ];
  for (const conflicting of coverageConflicts)
    add('records', 'coverage-gap-conflict:' + Object.keys(conflicting)[0], {
      kind: 'assignments',
      coverageGap: 'true',
      ...conflicting,
    });
  for (const query of [entity, { kind: 'person', id: personId, via: 'assignment', assignmentId }])
    valid.push({ route: 'entity', query });
  for (const query of [
    search,
    { query: ' x ', limit: '1' },
    { query: 'x'.repeat(120), limit: '50' },
  ])
    valid.push({ route: 'search', query });
  const recordControls: WorkspaceQuery[] = [
    records,
    { ...records, limit: '1' },
    { ...records, limit: '200' },
    { kind: 'cards', stage: 'station', stationId },
    { kind: 'gift-ledger', giftTypeId, rehearsal: 'false' },
    { kind: 'assignments', personId },
    { kind: 'assignments', coverageGap: 'true', running: 'true' },
    { kind: 'incidents', open: 'false' },
  ];
  for (const query of recordControls) valid.push({ route: 'records', query });
  return { invalid, valid };
}
