import { z } from 'zod';
import { Id } from '../common/index.js';

/**
 * The event a caller works in, as the client needs it to show anything: its
 * name, and the wall clock (IANA timezone) and locale every date and time is
 * shown in (ADR-003 §6), never the device's.
 */
export const EventSummary = z
  .object({
    id: Id,
    name: z.string(),
    timezone: z.string(),
    locale: z.string(),
  })
  .strict();
export type EventSummary = z.infer<typeof EventSummary>;
