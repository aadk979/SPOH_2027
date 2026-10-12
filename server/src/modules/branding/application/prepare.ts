import { ERROR_CODES } from '@spoh/shared';
import { requireCurrentPermission } from '../../../platform/access/currentPermission.js';
import type { PrismaTransactionClient } from '../../../platform/db/client.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';
import { ConflictError, ValidationError } from '../../../platform/errors/index.js';
import { systemClock, type Clock } from '../../../platform/time/index.js';
import { lockBrandingEvent } from '../data/repo.js';
import { readRegistry, REGISTRY_BUDGET, type BrandingRegistry } from '../domain/registry.js';

export type BrandingActor = ActorContext & { clock?: Clock };
export async function prepareBranding(tx: PrismaTransactionClient, input: { actor: BrandingActor; action: 'Content.Edit' | 'Content.Publish'; expectedVersion: number }) {
  const { actor } = input;
  const event = await lockBrandingEvent(actor.scope, tx);
  await requireCurrentPermission(tx, { scope: actor.scope, membershipId: actor.membershipId, personId: actor.volunteerId, action: input.action, clock: actor.clock });
  if (event.status === 'ARCHIVED') throw new ConflictError(ERROR_CODES.CONFLICT, 'Archived branding is read-only. Clone the event to use a different identity.');
  const registry = readRegistry(event.branding);
  if (registry.version !== input.expectedVersion) throw new ConflictError(ERROR_CODES.CONFLICT, 'The branding changed. Reload and review its latest version.');
  return { event, registry, now: (actor.clock ?? systemClock).now() };
}
export function assertRegistryBudget(registry: BrandingRegistry): void {
  if (Buffer.byteLength(JSON.stringify(registry)) > REGISTRY_BUDGET) throw new ValidationError('Branding history has reached its safe size limit. Contact the platform administrator; historical export logos must be retained.');
}
