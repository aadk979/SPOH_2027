import { zonedDayWindow } from '@spoh/shared';
import type { ReadContext } from '../access/currentRead.js';
import { ValidationError } from '../errors/index.js';
export { afterTime, boundedPage } from '../db/workspacePagination.js';

export interface TimeFilter { from?: string; to?: string; asOf?: string; date?: string }
async function intersectDay(context: ReadContext, input: { date: string; from?: Date; to?: Date }) {
  const event = await context.db.event.findUniqueOrThrow({ where: { id: context.scope.eventId },
    select: { timezone: true, dayBoundaryMinutes: true } });
  const day = zonedDayWindow(input.date, event.timezone, event.dayBoundaryMinutes);
  return { from: input.from && input.from > day.start ? input.from : day.start,
    to: input.to && input.to < day.end ? input.to : day.end };
}
/** Inclusive snapshot, exclusive interval end; a calendar day is an explicit intersection. */
export async function observedTime(context: ReadContext, filter: TimeFilter) {
  const asOf = filter.asOf ? new Date(filter.asOf) : context.now;
  if (asOf > context.now) throw new ValidationError('The observation cannot be in the future.');
  let from = filter.from ? new Date(filter.from) : undefined;
  let to = filter.to ? new Date(filter.to) : undefined;
  if (filter.date) {
    ({ from, to } = await intersectDay(context, { date: filter.date, ...(from ? { from } : {}), ...(to ? { to } : {}) }));
  }
  return { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}), lte: asOf };
}
export function capturePool(filter: { rehearsal?: boolean; includeRehearsal?: boolean }) {
  return filter.rehearsal !== undefined ? { rehearsal: filter.rehearsal }
    : filter.includeRehearsal ? {} : { rehearsal: false };
}
