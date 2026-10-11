import type { Action } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import type { ResourceRef } from '../../../platform/access/authorizer/index.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { ValidationError } from '../../../platform/errors/index.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { holdShiftReceipt } from './mutationReceipt.js';

export async function prepareShiftWrite(
  tx: PrismaTransactionClient,
  input: {
    actor: ActorContext;
    action: Action;
    resource: ResourceRef;
    key: string | undefined;
  },
) {
  const { actor } = input;
  await holdShiftReceipt(tx, actor.scope, input.key);
  const event = await holdCaptureEvent(tx, actor.scope);
  if (event.status === 'ARCHIVED') throw new ValidationError('Archived events are read only.');
  await requireCurrentPermission(tx, {
    scope: actor.scope,
    membershipId: actor.membershipId,
    personId: actor.volunteerId,
    action: input.action,
    resource: input.resource,
  });
}
