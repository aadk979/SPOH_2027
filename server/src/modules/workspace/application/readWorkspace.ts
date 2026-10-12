import type { EntityKind, EntityRef, RecordsKind, RecordsRequest, SearchRequest, SearchResponse } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import type { WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { ForbiddenError, NotFoundError } from '../../../platform/errors/index.js';
import { requireSelfRead } from '../../../platform/workspace/sourceRead.js';

export interface WorkspaceSources { entities: Record<EntityKind, WorkspaceSource>; records: Record<RecordsKind, WorkspaceSource> }
export async function readEntity(context: ReadContext, input: { ref: EntityRef; sources: WorkspaceSources }) {
  const result = await input.sources.entities[input.ref.kind].entity(context, input.ref);
  if (!result) throw new NotFoundError('Entity');
  return result;
}
export function readRecords(context: ReadContext, input: { request: RecordsRequest; sources: WorkspaceSources }) {
  return input.sources.records[input.request.filter.kind].records!(context, input.request);
}
/** Sources perform their own current visibility checks. A policy outage always propagates. */
export async function searchWorkspace(context: ReadContext, input: { query: SearchRequest; sources: WorkspaceSources }): Promise<SearchResponse> {
  await requireSelfRead(context);
  const data: SearchResponse['data'] = [];
  for (const source of new Set(Object.values(input.sources.entities))) {
    if (!source.search) continue;
    try { data.push(...await source.search(context, { ...input.query, limit: input.query.limit })); }
    catch (error) { if (!(error instanceof ForbiddenError)) throw error; }
  }
  data.sort((left, right) => left.title.localeCompare(right.title) || left.destination.kind.localeCompare(right.destination.kind)
    || left.destination.id.localeCompare(right.destination.id));
  const unique = data.filter((item, index) => data.findIndex((other) => other.destination.kind === item.destination.kind
    && other.destination.id === item.destination.id) === index);
  return { data: unique.slice(0, input.query.limit), meta: { count: Math.min(unique.length, input.query.limit), truncated: unique.length > input.query.limit } };
}
