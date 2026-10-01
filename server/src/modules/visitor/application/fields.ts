import type {
  CreateVisitorFieldRequest,
  UpdateVisitorFieldRequest,
  VisitorFieldRecord,
} from '@spoh/shared';
import { ERROR_CODES } from '@spoh/shared';
import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import type { EventScope } from '../../../platform/db/eventScope.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { toFieldRecord } from '../data/mappers.js';
import {
  createFieldRow,
  findFieldByCode,
  findFieldRow,
  listFieldRows,
  updateFieldRow,
} from '../data/repo.js';

export async function listVisitorFields(scope: EventScope): Promise<VisitorFieldRecord[]> {
  return (await listFieldRows(scope)).map(toFieldRecord);
}

/** Declare a field the event may collect (ADR-002 §4), audited. */
export async function createVisitorField(
  request: CreateVisitorFieldRequest,
  { scope, audit }: ActorContext,
): Promise<VisitorFieldRecord> {
  if (await findFieldByCode(scope, request.code)) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      `The event already has a field "${request.code}".`,
    );
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await createFieldRow(tx, scope, request);
    await writeAudit(tx, {
      ...audit,
      action: 'visitorField.create',
      entityType: 'VisitorField',
      entityId: created.id,
      after: { ...request },
    });
    return created;
  });
  return toFieldRecord(row);
}

/** Relabel a field, change its retention or readers, or retire it; audited. */
export async function updateVisitorField(
  id: string,
  patch: UpdateVisitorFieldRequest,
  { scope, audit }: ActorContext,
): Promise<VisitorFieldRecord> {
  const existing = await findFieldRow(scope, id);
  if (!existing) throw new NotFoundError('Visitor field');
  const row = await prisma.$transaction(async (tx) => {
    const updated = await updateFieldRow(tx, scope, { id, data: patch });
    await writeAudit(tx, {
      ...audit,
      action: 'visitorField.update',
      entityType: 'VisitorField',
      entityId: id,
      before: {
        label: existing.label,
        retentionDays: existing.retentionDays,
        readers: existing.readers,
        active: existing.active,
      },
      after: { ...patch },
    });
    return updated;
  });
  return toFieldRecord(row);
}
