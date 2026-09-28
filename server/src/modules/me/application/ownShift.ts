import { NotFoundError } from '../../../platform/errors/index.js';
import { findAssignmentById, type AssignmentWithContext } from '../data/repo.js';
import { assertOwnShift } from '../domain/shiftRules.js';

/** The caller's own assignment, or a 404 or 403. */
export async function loadOwnShift(
  volunteerId: string,
  assignmentId: string,
): Promise<AssignmentWithContext> {
  const assignment = await findAssignmentById(assignmentId);
  if (!assignment) throw new NotFoundError('Shift assignment');
  assertOwnShift(assignment, volunteerId);
  return assignment;
}
