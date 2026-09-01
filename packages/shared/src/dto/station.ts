import { z } from 'zod';
import { CourseCode, StationKind } from '../enums.js';
import { Id } from './common.js';

export const StationSummary = z
  .object({
    id: Id,
    code: z.string(),
    name: z.string(),
    kind: StationKind,
    courseCode: CourseCode.nullable(),
    floor: z.string().nullable(),
    /** Is this one of the rooms whose entries are counted (PRODUCT_BRIEF §3). */
    countsEntry: z.boolean(),
    /** Does a Mission Card get stamped here. */
    issuesStamp: z.boolean(),
    active: z.boolean(),
    sortOrder: z.number().int(),
  })
  .strict();
export type StationSummary = z.infer<typeof StationSummary>;
