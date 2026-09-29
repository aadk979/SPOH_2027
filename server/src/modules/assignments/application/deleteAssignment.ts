import { writeAudit } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { deleteAssignmentRow, findAssignmentForRemoval } from '../data/repo.js';
import { assertNotWorked } from '../domain/assignmentRules.js';
import type { ActorContext } from '../../../platform/http/auditContext.js';

export async function deleteAssignment(id: string, { scope, audit }: ActorContext): Promise<void> {
  const existing = await findAssignmentForRemoval(scope, id);
  if (!existing) throw new NotFoundError('Shift assignment');
  assertNotWorked(existing);

  await prisma.$transaction(async (tx) => {
    await deleteAssignmentRow(tx, scope, id);
    await writeAudit(tx, {
      ...audit,
      action: 'assignment.delete',
      entityType: 'ShiftAssignment',
      entityId: id,
      before: { ...existing },
    });
  });
}
