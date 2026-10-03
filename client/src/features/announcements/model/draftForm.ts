import type { AnnouncementDraftRecord } from '@spoh/shared';
import { EMPTY_COMPOSER, toAnnouncementRequest } from './composerRequest';
import { publicationInstant, publicationWallTime } from './scheduleForm';

export function initialDraftValues(draft: AnnouncementDraftRecord | undefined, timezone: string) {
  if (!draft) return { ...EMPTY_COMPOSER, priority: 'INFO' as const, expiresWallTime: '' };
  return {
    ...EMPTY_COMPOSER,
    body: draft.body,
    priority: draft.priority,
    requiresAck: draft.requiresAck,
    eventWide: !draft.target.stationId,
    stationId: draft.target.stationId ?? '',
    expiresWallTime: draft.expiresAt ? publicationWallTime(draft.expiresAt, timezone) : '',
  };
}

export function draftContentRequest(input: {
  values: ReturnType<typeof initialDraftValues>;
  ownStationId: string | null;
  timezone: string;
  draft?: AnnouncementDraftRecord | undefined;
}) {
  const request = toAnnouncementRequest(input.values, input.ownStationId);
  const previousExpiry = input.draft?.expiresAt;
  const expiryUnchanged =
    previousExpiry &&
    publicationWallTime(previousExpiry, input.timezone) === input.values.expiresWallTime;
  return {
    ...request,
    target: {
      ...request.target,
      ...(input.draft?.target.role ? { role: input.draft.target.role } : {}),
      ...(input.draft?.target.eventDayId ? { eventDayId: input.draft.target.eventDayId } : {}),
    },
    ...(input.values.expiresWallTime
      ? {
          expiresAt: expiryUnchanged
            ? previousExpiry
            : publicationInstant(input.values.expiresWallTime, input.timezone),
        }
      : {}),
  };
}
