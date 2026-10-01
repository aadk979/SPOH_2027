import { z } from 'zod';
import { Id } from '../common/index.js';

/** Manual roster edit, for the shifts an import did not cover. */
export const CreateAssignmentRequest = z
  .object({
    volunteerId: Id,
    stationId: Id,
    /** One of the event's shifts: a day and a template (ADR-002). */
    shiftId: Id,
    roleLabel: z.string().trim().min(1).max(64).default('Volunteer'),
  })
  .strict();
export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentRequest>;
