import { writeAudit } from '../../../platform/audit/index.js';
import { holdCaptureEvent } from '../../../platform/db/captureProvenance.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findRegistrationForUpdate, voidRegistration } from '../data/repo.js';
import { assertNotVoided } from '../domain/voiding.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

/**
 * Voiding keeps the row and excludes it from every count. Deleting it would
 * make the correction invisible, and reconciliation depends on being able to
 * see what was corrected and why.
 */
export async function voidRegistrationById(
  id: string,
  reason: string,
  { scope, audit }: ActorContext,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await holdCaptureEvent(tx, scope);
    const existing = await findRegistrationForUpdate(tx, scope, id);
    if (!existing) throw new NotFoundError('Registration');
    assertNotVoided(existing);
    const updated = await voidRegistration(tx, scope, { id, reason });
    await writeAudit(tx, {
      ...audit,
      action: 'registration.void',
      entityType: 'Registration',
      entityId: id,
      before: { voided: false, category: existing.captureCategory.code },
      after: { voided: true, voidedReason: updated.voidedReason },
    });
  });
}
