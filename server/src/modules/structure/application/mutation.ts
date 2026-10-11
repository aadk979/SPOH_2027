import { ERROR_CODES, type EventStatus } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import { writeAudit, type AuditAction } from '../../../platform/audit/index.js';
import { prisma, type PrismaTransactionClient } from '../../../platform/db/client.js';
import { ConflictError, NotFoundError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { lockReserved, settleReserved } from '../../../platform/idempotency/index.js';
import { lockStructureEvent } from '../data/metadataRepo.js';
import { structureCreatable, structureWritable } from '../domain/windows.js';

type Mutation = {
  actor: ActorContext;
  action: 'Structure.Change' | 'Structure.Edit';
  key: string;
  auditAction: AuditAction;
  statusCode?: 200 | 201;
};
type Outcome<Data extends object> = {
  data: Data;
  entityType: string;
  entityId: string;
  before?: object;
  after: object;
};
export async function requireStructureChange(
  actor: ActorContext,
  tx: PrismaTransactionClient,
): Promise<void> {
  const event = await lockStructureEvent(actor.scope, tx);
  if (!event) throw new NotFoundError('Event');
  if (!structureCreatable(event.status as EventStatus))
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'Capabilities and shift hours are frozen after go-live.',
    );
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    action: 'Structure.Change',
  });
}
export async function requireStructureEdit(
  actor: ActorContext,
  tx: PrismaTransactionClient,
): Promise<void> {
  const event = await lockStructureEvent(actor.scope, tx);
  if (!event) throw new NotFoundError('Event');
  if (!structureWritable(event.status as EventStatus))
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Archived structure is read-only.');
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    action: 'Structure.Edit',
  });
}
export function mutateStructure<Data extends object>(
  input: Mutation,
  work: (tx: PrismaTransactionClient, timezone: string) => Promise<Outcome<Data>>,
) {
  return prisma.$transaction(async (tx) => {
    const event = await lockStructureEvent(input.actor.scope, tx);
    if (!event) throw new NotFoundError('Event');
    if (
      !structureWritable(event.status as EventStatus) ||
      (input.action === 'Structure.Change' && !structureCreatable(event.status as EventStatus))
    )
      throw new ConflictError(
        ERROR_CODES.CONFLICT,
        'Structure cannot be changed at this event stage.',
      );
    await requireCurrentPermission(tx, {
      scope: input.actor.scope,
      membershipId: input.actor.membershipId,
      personId: input.actor.volunteerId,
      action: input.action,
    });
    await lockReserved(tx, input.actor.scope, input.key);
    const outcome = await work(tx, event.timezone);
    await writeAudit(tx, {
      ...input.actor.audit,
      action: input.auditAction,
      entityType: outcome.entityType,
      entityId: outcome.entityId,
      before: outcome.before,
      after: outcome.after,
    });
    const response = { data: outcome.data };
    await settleReserved(tx, input.actor.scope, {
      key: input.key,
      statusCode: input.statusCode ?? (input.action === 'Structure.Change' ? 201 : 200),
      body: response,
    });
    return response;
  });
}
