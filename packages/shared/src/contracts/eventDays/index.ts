import { z } from 'zod';
import { Id, IsoDate, IsoDateTime } from '../common/index.js';

/**
 * Event days. A fourth day nobody planned for is ordinary, and must not need a
 * deploy; `config.manage` changes what the event is.
 */

export const EventDayRecord = z
  .object({
    id: Id,
    date: IsoDate,
    label: z.string(),
    isPublicDay: z.boolean(),
    isTourDay: z.boolean(),
    assignmentCount: z.number().int().nonnegative(),
    createdAt: IsoDateTime,
  })
  .strict();
export type EventDayRecord = z.infer<typeof EventDayRecord>;

export const CreateEventDayRequest = z
  .object({
    date: IsoDate,
    label: z.string().trim().min(1).max(120),
    isPublicDay: z.boolean().default(true),
    isTourDay: z.boolean().default(false),
  })
  .strict();
export type CreateEventDayRequest = z.infer<typeof CreateEventDayRequest>;

export const UpdateEventDayRequest = CreateEventDayRequest.omit({ date: true })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'supply at least one field to change',
  });
export type UpdateEventDayRequest = z.infer<typeof UpdateEventDayRequest>;
