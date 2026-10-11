import { z } from 'zod';
import {
  EventStatus,
  type CreateLifecycleScheduleRequest,
  type CreateReportScheduleRequest,
} from '@spoh/shared';
import { captureScheduleInstant } from './captureScheduleReview';

export const eventStatusLabels: Record<EventStatus, string> = {
  DRAFT: 'Draft',
  READY: 'Ready',
  REHEARSAL: 'Rehearsal',
  LIVE: 'Live',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};

const WallTime = z.string().min(1, 'Choose a date and time on the event clock.');

export const LifecycleScheduleFields = z.object({
  to: EventStatus,
  wallTime: WallTime,
  reason: z.string().trim().max(500),
});
export type LifecycleScheduleFields = z.infer<typeof LifecycleScheduleFields>;

export const ReportScheduleFields = z.object({
  eventDayId: z.string().min(1, 'Choose the day to report on.'),
  wallTime: WallTime,
  includeRehearsal: z.boolean(),
});
export type ReportScheduleFields = z.infer<typeof ReportScheduleFields>;

/** The request a reviewed lifecycle form sends; throws on an impossible event-clock time. */
export function lifecycleScheduleBody(input: {
  fields: LifecycleScheduleFields;
  expectedVersion: number;
  timezone: string;
  idempotencyKey: string;
}): CreateLifecycleScheduleRequest {
  const { fields, expectedVersion, timezone, idempotencyKey } = input;
  const reason = fields.reason.trim();
  return {
    to: fields.to,
    expectedVersion,
    runAt: captureScheduleInstant(fields.wallTime, timezone),
    idempotencyKey,
    ...(reason ? { reason } : {}),
  };
}

export function reportScheduleBody(input: {
  fields: ReportScheduleFields;
  timezone: string;
  idempotencyKey: string;
}): CreateReportScheduleRequest {
  const { fields, timezone, idempotencyKey } = input;
  return {
    eventDayId: fields.eventDayId,
    includeRehearsal: fields.includeRehearsal,
    runAt: captureScheduleInstant(fields.wallTime, timezone),
    idempotencyKey,
  };
}

/** Only the kinds this screen produces can be cancelled here; the rest have their own editors. */
export function cancellableHere(row: { kind: string; status: string }): boolean {
  return row.status === 'PENDING' && (row.kind === 'LIFECYCLE' || row.kind === 'REPORT');
}
