import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { findRegistrationById, voidRegistration } from '../data/repo.js';
import { assertNotVoided } from '../domain/voiding.js';

/**
 * Voiding keeps the row and excludes it from every count. Deleting it would
 * make the correction invisible, and reconciliation depends on being able to
 * see what was corrected and why.
 */
export async function voidRegistrationById(
  id: string,
  reason: string,
  audit: AuditContext,
): Promise<void> {
  const existing = await findRegistrationById(id);
  if (!existing) throw new NotFoundError('Registration');
  assertNotVoided(existing);

  await prisma.$transaction(async (tx) => {
    const updated = await voidRegistration(tx, id, reason);
    await writeAudit(tx, {
      ...audit,
      action: 'registration.void',
      entityType: 'Registration',
      entityId: id,
      before: { voided: false, category: existing.category },
      after: { voided: true, voidedReason: updated.voidedReason },
    });
  });
}
