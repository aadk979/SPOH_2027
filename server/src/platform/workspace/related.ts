import type { EntityKind, WorkspaceLink } from '@spoh/shared';
import type { ReadContext } from '../access/currentRead.js';
import { entityLink } from './sourceRead.js';

export async function stationRelated(context: ReadContext, id: string | null): Promise<WorkspaceLink[]> {
  if (!id || !context.membershipId || !await context.canRead({ action: 'Self.Read',
    resource: { type: 'Membership', id: context.membershipId } })) return [];
  return [entityLink('Station', { kind: 'station', id })];
}
export async function actorRelated(context: ReadContext, id: string | null): Promise<WorkspaceLink[]> {
  if (!id) return [];
  const allowed = id === context.personId && context.membershipId
    ? await context.canRead({ action: 'Self.Read', resource: { type: 'Membership', id: context.membershipId } })
    : await context.canRead({ action: 'People.Read', resource: { type: 'Event', id: context.scope.eventId } });
  if (!allowed) return [];
  const member = await context.db.eventMembership.findFirst({ where: { eventId: context.scope.eventId,
    personId: id }, select: { id: true } });
  return member ? [entityLink('Person', { kind: 'person', id })] : [];
}
export async function cardRelated(context: ReadContext, id: string | null): Promise<WorkspaceLink[]> {
  if (!id || !context.membershipId || !await context.canRead({ action: 'Self.Read',
    resource: { type: 'Membership', id: context.membershipId } })) return [];
  return [entityLink('Card', { kind: 'card', id })];
}
export async function importRelated(context: ReadContext,
  batch: { id: string; targetTable: string; event: { status: string } } | null): Promise<WorkspaceLink[]> {
  if (!batch) return [];
  const resource = { type: 'Event' as const, id: context.scope.eventId };
  const audit = await context.canRead({ action: 'Audit.Read', resource });
  const allowed = audit || (batch.event.status !== 'ARCHIVED' && await context.canRead({
    action: batch.targetTable === 'Roster' ? 'Roster.Edit' : 'Fallback.Import', resource }));
  return allowed ? [entityLink('Retained import batch', { kind: 'import', id: batch.id })] : [];
}
export function recordsLink(label: string, filter: Extract<WorkspaceLink['destination'], { type: 'records' }>['filter']): WorkspaceLink {
  return { label, destination: { type: 'records', filter } };
}
export async function auditRelated(context: ReadContext, entity: { kind: EntityKind; type: string; id: string }) {
  if (!await context.canRead({ action: 'Audit.Read', resource: { type: 'Event', id: context.scope.eventId } })) return [];
  return [recordsLink('Audit history', { kind: 'audit', entityType: entity.type, entityId: entity.id })];
}
