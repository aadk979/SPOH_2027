import { EntityRef, RecordsFilter, type WorkspaceDestination } from '@spoh/shared';

const queryPath = (path: string, input: Record<string, unknown>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  return params.size ? `${path}?${params.toString()}` : path;
};
export function entityPath(input: EntityRef): string {
  const { via, ...target } = EntityRef.parse(input);
  return queryPath('/entity', { ...target, ...(via ? { via: via.kind, assignmentId: via.assignmentId } : {}) });
}
export function recordsPath(input: RecordsFilter): string {
  return queryPath('/records', RecordsFilter.parse(input));
}
export function searchPath(query?: string): string {
  return queryPath('/search', { query });
}
export function workspacePath(destination: WorkspaceDestination): string {
  switch (destination.type) {
    case 'entity': return entityPath(destination.target);
    case 'records': return recordsPath(destination.filter);
    case 'action': return queryPath(destination.path, destination.query ?? {});
    case 'platform': return queryPath(destination.path, { eventId: destination.eventId });
  }
}

/** URL strings retain false and raw station codes; schemas reject unknown combinations. */
export function recordsFilterFromParams(params: Pick<URLSearchParams, 'entries'>): RecordsFilter {
  const value: Record<string, unknown> = Object.fromEntries(params.entries());
  delete value.cursor;
  delete value.limit;
  for (const key of ['rehearsal', 'includeRehearsal', 'voided', 'flagged', 'running', 'checkedIn', 'checkedOut', 'open', 'excludeLost', 'countedStationsOnly', 'coverageGap']) {
    if (value[key] === 'true') value[key] = true;
    else if (value[key] === 'false') value[key] = false;
  }
  return RecordsFilter.parse(value);
}
