import { Id } from '@spoh/shared';
import { z } from 'zod';
import { requireCurrentCapability } from '../../platform/access/currentCapability.js';
import { holdCaptureEvent } from '../../platform/db/captureProvenance.js';
import { ScheduleRefusal } from '../../platform/scheduler/failure.js';
import { defineScheduledHandler, type ScheduleContext } from '../../platform/scheduler/handler.js';
import { changeSettingInTransaction } from '../../platform/settings/change.js';
import { SETTINGS } from '../../platform/settings/registry.js';

/** Further setting keys/scopes stay unavailable until their consumers and authority are wired. */
const captureSettingPayload = z
  .object({
    scope: z.enum(['event', 'station']),
    scopeId: Id,
    key: z.literal('capture.open'),
    value: SETTINGS['capture.open'].schema,
    expectedVersion: z.number().int().min(0),
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
type CaptureSettingPayload = z.infer<typeof captureSettingPayload>;

function captureSettingTarget(context: ScheduleContext, payload: CaptureSettingPayload) {
  const eventId = context.action.eventId;
  if (eventId === null) throw new ScheduleRefusal('AUTHORITY_CHANGED');
  if (payload.scope === 'event') {
    if (payload.scopeId !== eventId) throw new ScheduleRefusal('TARGET_MISSING');
    return { scope: 'event' as const, eventId };
  }
  return { scope: 'station' as const, eventId, stationId: payload.scopeId };
}

async function authorizeCaptureSetting(context: ScheduleContext, payload: CaptureSettingPayload) {
  const personId = context.action.createdByPersonId;
  const membershipId = context.audit.membershipId;
  if (personId === null || membershipId === null) throw new ScheduleRefusal('AUTHORITY_CHANGED');
  const target = captureSettingTarget(context, payload);
  await requireCurrentCapability(context.tx, {
    scope: target,
    membershipId,
    personId,
    capability: 'config.manage',
  });
  if ((await holdCaptureEvent(context.tx, target)).status === 'ARCHIVED') {
    throw new ScheduleRefusal('GUARD_FAILED');
  }
}

export const settingsScheduledHandlers = [
  defineScheduledHandler({
    type: 'setting.apply',
    schema: captureSettingPayload,
    authorize: authorizeCaptureSetting,
    run: async (context, payload) => {
      await changeSettingInTransaction(context.tx, {
        target: captureSettingTarget(context, payload),
        key: payload.key,
        value: payload.value,
        expectedVersion: payload.expectedVersion,
        reason: payload.reason,
        actorPersonId: context.action.createdByPersonId,
        audit: context.audit,
        source: 'SCHEDULE',
        scheduledActionId: context.action.id,
      });
    },
  }),
];
