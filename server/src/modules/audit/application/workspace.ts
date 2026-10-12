import type { EntityRef, RecordsRequest } from '@spoh/shared';
import type { ReadContext } from '../../../platform/access/currentRead.js';
import { ValidationError } from '../../../platform/errors/index.js';
import { cursorAnchor, recordsProjection, requireEventRead,
  type WorkspaceSource } from '../../../platform/workspace/sourceRead.js';
import { boundedPage, observedTime } from '../../../platform/workspace/observation.js';
import { auditCursor, countWorkspaceAudit, searchWorkspaceAudit, workspaceAuditPage, workspaceAuditRow } from '../data/workspaceRepo.js';
import { auditProjection, auditRecord, type AuditEntityReader } from './workspaceProjection.js';

async function readAudit(context: ReadContext, ref: EntityRef, reader?: AuditEntityReader) {
  if (ref.kind !== 'audit') return null;
  await requireEventRead(context, 'Audit.Read');
  const row = await workspaceAuditRow(context.scope, context.db, ref.id);
  return row ? auditProjection(context, ref, { row, ...(reader ? { reader } : {}) }) : null;
}

async function readAuditRecords(context: ReadContext, input: RecordsRequest) {
  if (input.filter.kind !== 'audit') throw new ValidationError('Choose audit records.');
  await requireEventRead(context, 'Audit.Read');
  const selection = { filter: input.filter, time: await observedTime(context, input.filter) };
  const anchor = await cursorAnchor(input.cursor, (cursor) => auditCursor(context.scope, context.db, { ...selection, cursor }));
  const count = await countWorkspaceAudit(context.scope, context.db, selection);
  const page = boundedPage(await workspaceAuditPage(context.scope, context.db, { ...selection, limit: input.limit,
    anchor: anchor ? { id: anchor.id, at: anchor.createdAt } : null }), input.limit);
  return recordsProjection(context, input, { data: page.rows.map(auditRecord), count,
    aggregate: { value: count, unit: 'auditRows' }, nextCursor: page.nextCursor });
}

export function createAuditWorkspaceSource(reader?: AuditEntityReader): WorkspaceSource {
  return { entity: (context, ref) => readAudit(context, ref, reader), records: readAuditRecords,
    async search(context, request) {
      await requireEventRead(context, 'Audit.Read');
      const rows = await searchWorkspaceAudit(context.scope, context.db, { ...request, asOf: context.now });
      return rows.map((row) => ({ title: row.action.slice(0, 240), detail: `${row.entityType} · ${row.outcome}`.slice(0, 300),
        destination: { kind: 'audit' as const, id: row.id } }));
    } };
}
export const auditWorkspaceSource = createAuditWorkspaceSource();
