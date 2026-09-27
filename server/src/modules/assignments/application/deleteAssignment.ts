import { writeAudit, type AuditContext } from '../../../platform/audit/index.js';
import { prisma } from '../../../platform/db/client.js';
import { NotFoundError } from '../../../platform/errors/index.js';
import { deleteAssignmentRow, findAssignmentForRemoval } from '../data/repo.js';
import { assertNotWorked } from '../domain/assignmentRules.js';

export async function deleteAssignment(id: string, audit: AuditContext): Promise<void> {
  const existing = await findAssignmentForRemoval(id);
  if (!existing) throw new NotFoundError('Shift assignment');
  assertNotWorked(existing);

  await prisma.$transaction(async (tx) => {
    await deleteAssignmentRow(tx, id);
    await writeAudit(tx, {
      ...audit,
      action: 'assignment.delete',
      entityType: 'ShiftAssignment',
      entityId: id,
      before: { ...existing },
    });
  });
}
