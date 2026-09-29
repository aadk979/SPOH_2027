import { z } from 'zod';
import { ShiftBlock } from '../../invariants/enums.js';
import { Id } from '../common/index.js';

/** Manual roster edit, for the shifts an import did not cover. */
export const CreateAssignmentRequest = z
  .object({
    volunteerId: Id,
    stationId: Id,
    eventDayId: Id,
    block: ShiftBlock,
    roleLabel: z.string().trim().min(1).max(64).default('Volunteer'),
  })
  .strict();
export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentRequest>;
