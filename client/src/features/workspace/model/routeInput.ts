import { EntityQuery, RecordsQuery, SearchQuery, type EntityRef, type RecordsRequest, type SearchRequest } from '@spoh/shared';

function uniqueParams(params: Pick<URLSearchParams, 'entries'>): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (result.has(key)) throw new Error('Each filter must appear once. Return to the source link.');
    result.set(key, value);
  }
  return result;
}

export function entityFromParams(input: Pick<URLSearchParams, 'entries'>): EntityRef {
  return EntityQuery.parse(Object.fromEntries(uniqueParams(input)));
}

export function recordsFromParams(input: Pick<URLSearchParams, 'entries'>): RecordsRequest {
  return RecordsQuery.parse(Object.fromEntries(uniqueParams(input)));
}

export function searchFromParams(input: Pick<URLSearchParams, 'entries'>): SearchRequest | null {
  const values = Object.fromEntries(uniqueParams(input));
  if (!Object.keys(values).length) return null;
  return SearchQuery.parse(values);
}

export function routeInput<T>(parse: () => T): { data: T; error: null } | { data: null; error: Error } {
  try { return { data: parse(), error: null }; }
  catch { return { data: null, error: new Error('This link has invalid or incompatible filters. Return to its source or search this event.') }; }
}
