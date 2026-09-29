import { NotFoundError } from '../../../platform/errors/index.js';
import { findAssignmentById, type AssignmentWithContext } from '../data/repo.js';
import { assertOwnShift } from '../domain/shiftRules.js';
import type { EventScope } from '../../../platform/db/eventScope.js';

/** The caller's own assignment, or a 404 or 403. */
export async function loadOwnShift(
  scope: EventScope,
  shift: { volunteerId: string; assignmentId: string },
): Promise<AssignmentWithContext> {
  const { volunteerId, assignmentId } = shift;
  const assignment = await findAssignmentById(scope, assignmentId);
  if (!assignment) throw new NotFoundError('Shift assignment');
  assertOwnShift(assignment, volunteerId);
  return assignment;
}
