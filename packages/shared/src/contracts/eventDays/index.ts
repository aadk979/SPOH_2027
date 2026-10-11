import { z } from 'zod';
import { Id, IdempotencyKey, IsoDate, IsoDateTime } from '../common/index.js';
import { WallClockTime } from '../settings/index.js';
import { ShiftRef } from '../shift/index.js';

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
    /** The day's shifts, earliest first: what an assignment is made on. */
    shifts: z.array(ShiftRef),
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
    idempotencyKey: IdempotencyKey.optional(),
  })
  .strict();
export type CreateEventDayRequest = z.infer<typeof CreateEventDayRequest>;

export const UpdateEventDayRequest = CreateEventDayRequest.omit({ date: true })
  .partial()
  .extend({ isPublicDay: z.boolean().optional(), isTourDay: z.boolean().optional() })
  .strict()
  .refine((patch) => Object.keys(patch).some((key) => key !== 'idempotencyKey'), {
    message: 'supply at least one field to change',
  });
export type UpdateEventDayRequest = z.infer<typeof UpdateEventDayRequest>;

/**
 * A shift pattern in the event's local time (ADR-002). Its hours decide when
 * capture and check-in are open; editing them moves every shift of the
 * template that the exceptions grid has not overridden.
 */
export const ShiftTemplateRecord = z
  .object({
    id: Id,
    code: z.string(),
    label: z.string(),
    startLocal: WallClockTime,
    endLocal: WallClockTime,
    endsNextDay: z.boolean(),
    sortOrder: z.number().int(),
  })
  .strict();
export type ShiftTemplateRecord = z.infer<typeof ShiftTemplateRecord>;

export const UpdateShiftTemplateRequest = z
  .object({
    label: z.string().trim().min(1).max(80),
    startLocal: WallClockTime,
    endLocal: WallClockTime,
    idempotencyKey: IdempotencyKey.optional(),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).some((key) => key !== 'idempotencyKey'), {
    message: 'supply at least one field to change',
  });
export type UpdateShiftTemplateRequest = z.infer<typeof UpdateShiftTemplateRequest>;
