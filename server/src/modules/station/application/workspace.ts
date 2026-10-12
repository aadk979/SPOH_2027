import type { EntityRef, WorkspaceLink } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { entityProjection, field, requireSelfRead,
  type WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { searchStationReferences, stationReference } from '../data/workspaceRepo.js';
import { ForbiddenError } from '../../../platform/errors/index.js';
import { auditRelated, recordsLink } from '../../../platform/workspace/related.js';

async function requireReference(context: ReadContext): Promise<void> {
  if (context.membershipId) return requireSelfRead(context);
  if (!(await context.canRead({ action: 'Platform.AdministerEvent', resource: { type: 'Event', id: context.scope.eventId }, asPerson: true }))) {
    throw new ForbiddenError();
  }
}

async function stationLinks(context: ReadContext, id: string): Promise<WorkspaceLink[]> {
  const links: WorkspaceLink[] = [];
  if (await context.canRead({ action: 'Dashboard.ReadStation', resource: { type: 'Station', id } })) {
    for (const kind of ['registrations', 'footfall', 'stamps', 'redemptions'] as const) {
      links.push({ label: kind, destination: { type: 'records', filter: { kind, stationId: id, asOf: context.now.toISOString() } } });
    }
    for (const kind of ['registrations', 'footfall'] as const) {
      links.push(recordsLink(`APP ${kind}`, { kind, stationId: id, source: 'APP', asOf: context.now.toISOString() }));
    }
    links.push({ label: 'Fallback windows', destination: { type: 'records', filter: { kind: 'fallback', stationId: id } } });
  }
  if (await context.canRead({ action: 'Roster.ReadStation', resource: { type: 'Station', id } })) {
    links.push({ label: 'Station roster', destination: { type: 'records', filter: { kind: 'assignments', stationId: id } } });
  }
  if (await context.canRead({ action: 'Incident.Read', resource: { type: 'Event', id: context.scope.eventId } })) {
    links.push({ label: 'Incidents', destination: { type: 'records', filter: { kind: 'incidents', stationId: id } } });
  }
  if (context.membershipId) {
    links.push({ label: 'Lost-person alerts', destination: { type: 'records', filter: { kind: 'lost-person', stationId: id } } });
    links.push({ label: 'Found items', destination: { type: 'records', filter: { kind: 'lost-found', stationId: id } } });
  }
  return [...links, ...await auditRelated(context, { kind: 'station', type: 'Station', id })];
}

async function stationActions(context: ReadContext): Promise<WorkspaceLink[]> {
  if (await context.canRead({ action: 'Structure.Read', resource: { type: 'Event', id: context.scope.eventId } })) {
    return [{ label: 'Station configuration', destination: { type: 'action', path: '/admin/stations' } }];
  }
  return [];
}

async function readStation(context: ReadContext, ref: EntityRef) {
  if (ref.kind !== 'station') return null;
  await requireReference(context);
  const station = await stationReference(context.scope, context.db, ref.id);
  if (!station) return null;
  return entityProjection(context, ref, { title: station.name,
    fields: [field('Code', station.code), field('Floor', station.floor), field('Active', station.active, 'boolean')],
    related: await stationLinks(context, station.id), actions: await stationActions(context) });
}

export const stationWorkspaceSource: WorkspaceSource = {
  entity: readStation,
  async search(context, input) {
    await requireReference(context);
    const rows = await searchStationReferences(context.scope, context.db, input);
    return rows.map((row) => ({ title: row.name.slice(0, 240), detail: row.code.slice(0, 300),
      destination: { kind: 'station' as const, id: row.id } }));
  },
};
