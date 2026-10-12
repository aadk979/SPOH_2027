import type { EntityRef, EntityResponse, RecordRow, RecordsAggregate, RecordsRequest,
  RecordsResponse, SearchRequest, SearchResponse, WorkspaceField, WorkspaceLink } from '@spoh/shared';
import type { Action } from '@spoh/access-policies';
import type { ReadContext } from '../access/currentRead.js';
import { readableStationIds } from '../access/readStations.js';
import { databaseRoleGrants, type ResourceRef } from '../access/authorizer/index.js';
import { ForbiddenError, NotFoundError } from '../errors/index.js';

/** Source-owned facades. Workspace imports module indexes, never source repositories. */
export interface WorkspaceSource {
  entity(context: ReadContext, ref: EntityRef): Promise<EntityResponse | null>;
  records?(context: ReadContext, input: RecordsRequest): Promise<RecordsResponse>;
  search?(context: ReadContext, input: SearchRequest): Promise<SearchResponse['data']>;
}
export async function requireRead(context: ReadContext, action: Action, resource: ResourceRef): Promise<void> {
  if (!(await context.canRead({ action, resource }))) throw new ForbiddenError('You cannot read this information in this event.');
}
export async function requireSelfRead(context: ReadContext): Promise<void> {
  if (!context.membershipId) throw new ForbiddenError();
  await requireRead(context, 'Self.Read', { type: 'Membership', id: context.membershipId });
}
export async function requireEventRead(context: ReadContext, action: Action): Promise<void> {
  await requireRead(context, action, { type: 'Event', id: context.scope.eventId });
}
/** An empty collection proves identity/archive standing and a stored grant, never a fake resource. */
export async function readableCollectionStations(context: ReadContext, action: Action,
  stationId?: string): Promise<string[]> {
  if (stationId) {
    const station = await context.db.station.findFirst({ where: { eventId: context.scope.eventId, id: stationId }, select: { id: true } });
    if (!station) throw new NotFoundError('Station');
    await requireRead(context, action, { type: 'Station', id: stationId });
    return [stationId];
  }
  const ids = await readableStationIds(context, action);
  if (ids.length) return ids;
  // A denied resource is an answered policy question. Only a genuinely empty
  // event may use the existing no-candidate collection rule.
  const candidate = await context.db.station.findFirst({ where: { eventId: context.scope.eventId }, select: { id: true } });
  if (candidate) throw new ForbiddenError();
  await requireSelfRead(context);
  const member = await context.db.eventMembership.findFirst({ where: { eventId: context.scope.eventId,
    id: context.membershipId, personId: context.personId }, select: { role: true } });
  const grants = await databaseRoleGrants.grantsFor(context.db, context.scope.eventId);
  if (!member || !grants[member.role].grants.includes(action)) throw new ForbiddenError();
  return [];
}
export const field = (label: string, value: WorkspaceField['value'], format: WorkspaceField['format'] = 'text'): WorkspaceField =>
  ({ label, value: typeof value === 'string' ? value.slice(0, 2000) : value, format });
export const entityLink = (label: string, target: EntityRef): WorkspaceLink => ({ label: label.slice(0, 160), destination: { type: 'entity', target } });
export function entityProjection(context: ReadContext, ref: EntityRef, input: {
  title: string; fields: WorkspaceField[]; related?: WorkspaceLink[]; actions?: WorkspaceLink[];
}): EntityResponse {
  return { ref, title: input.title.slice(0, 240), fields: input.fields, related: input.related ?? [],
    actions: input.actions ?? [], facets: [], asOf: context.now.toISOString() };
}
export function recordsProjection(context: ReadContext, request: RecordsRequest, input: {
  data: RecordRow[]; count: number; aggregate: RecordsAggregate; nextCursor: string | null;
}): RecordsResponse {
  const filter = request.filter.kind === 'people' || request.filter.kind === 'days' ? request.filter
    : { ...request.filter, asOf: request.filter.asOf ?? context.now.toISOString() };
  const asOf = 'asOf' in filter ? filter.asOf! : context.now.toISOString();
  return { filter, asOf, data: input.data, aggregate: input.aggregate,
    meta: { count: input.count, nextCursor: input.nextCursor } };
}
/** Resolve the cursor with the very same event/visibility/filter predicate before paging. */
export async function cursorAnchor<T>(cursor: string | undefined, find: (id: string) => Promise<T | null>): Promise<T | null> {
  if (!cursor) return null;
  const anchor = await find(cursor);
  if (!anchor) throw new NotFoundError('Records cursor');
  return anchor;
}

/** A read transaction has one connection; finish each row before starting its private facets. */
export async function mapReadRows<T, R>(rows: readonly T[], read: (row: T) => Promise<R>): Promise<R[]> {
  const result: R[] = [];
  for (const row of rows) result.push(await read(row));
  return result;
}
