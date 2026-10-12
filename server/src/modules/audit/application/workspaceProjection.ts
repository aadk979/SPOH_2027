import type { EntityKind, EntityRef, EntityResponse, RecordRow, WorkspaceLink } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { ForbiddenError, NotFoundError } from '../../../platform/errors/index.js';
import { entityLink, entityProjection, field } from '../../../platform/workspace/sourceRead.js';
import { actorRelated } from '../../../platform/workspace/related.js';
import type { WorkspaceAuditRow } from '../data/workspaceRepo.js';

export type AuditEntityReader = (context: ReadContext, ref: EntityRef) => Promise<EntityResponse | null>;
const entityKinds: Readonly<Record<string, EntityKind>> = {
  Station: 'station', Person: 'person', Volunteer: 'person', EventMembership: 'person', EventDay: 'event-day', Shift: 'shift',
  MissionCard: 'card', Incident: 'incident', LostPersonAlert: 'lost-person', LostFoundItem: 'lost-found', Announcement: 'announcement',
  FallbackWindow: 'fallback', ImportBatch: 'import', ShiftAssignment: 'assignment', Registration: 'registration',
  FootfallTick: 'footfall', GiftRedemption: 'redemption', GiftType: 'gift',
};

function auditFields(row: WorkspaceAuditRow) {
  return [field('Action', row.action), field('Outcome', row.outcome), field('Severity', row.severity), field('Source', row.source),
    field('Entity type', row.entityType), field('Entity reference', row.entityId), field('Recorded', row.createdAt.toISOString(), 'instant')];
}

async function targetRelated(context: ReadContext, row: WorkspaceAuditRow, reader?: AuditEntityReader): Promise<WorkspaceLink[]> {
  const kind = entityKinds[row.entityType];
  // Membership audit ids are membership ids, whereas a person home uses person ids.
  if (!reader || !kind || !row.entityId || row.entityType === 'EventMembership') return [];
  const target: EntityRef = { kind, id: row.entityId };
  try {
    const resolved = await reader(context, target);
    return resolved ? [entityLink(`Entity: ${resolved.title}`.slice(0, 160), target)] : [];
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof NotFoundError) return [];
    throw error;
  }
}

export async function auditProjection(context: ReadContext, ref: EntityRef,
  input: { row: WorkspaceAuditRow; reader?: AuditEntityReader }) {
  const related = [...await targetRelated(context, input.row, input.reader), ...await actorRelated(context, input.row.actorId)];
  return entityProjection(context, ref, { title: input.row.action, fields: auditFields(input.row), related });
}

export function auditRecord(row: WorkspaceAuditRow): RecordRow {
  return { id: row.id, title: row.action.slice(0, 240), recordedAt: row.createdAt.toISOString(), fields: auditFields(row),
    destination: { kind: 'audit', id: row.id }, related: [] };
}
