import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findTickById, voidTick } from '../data/repo.js';
import { assertTickNotVoided } from '../domain/footfallRules.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

/** Void a wrong tick. The row stays, excluded from every sum, and the void is audited. */
export async function voidTickById(
  id: string,
  reason: string,
  { scope, audit }: ActorContext,
): Promise<void> {
  const existing = await findTickById(scope, id);
  if (!existing) throw new NotFoundError('Footfall tick');
  assertTickNotVoided(existing);

  await prisma.$transaction(async (tx) => {
    await voidTick(tx, scope, id);
    await writeAudit(tx, {
      ...audit,
      action: 'footfall.void',
      entityType: 'FootfallTick',
      entityId: id,
      before: { voided: false, quantity: existing.quantity, stationId: existing.stationId },
      after: { voided: true, reason },
    });
  });
}
