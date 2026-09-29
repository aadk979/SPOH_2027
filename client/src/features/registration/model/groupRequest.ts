import { CreateGroupRegistrationRequest } from '@spoh/shared';
import { groupMembers, type GroupCounts } from './groupMembers';

export interface GroupValues {
  counts: GroupCounts;
  shortCode: string;
}

export const EMPTY_GROUP: GroupValues = { counts: {}, shortCode: '' };

/** Member errors (the 20-person cap) belong to the counters; the card code to its box. */
export const GROUP_ERROR_FIELDS = {
  members: 'counts',
  missionCardShortCode: 'shortCode',
} as const;

/**
 * The card code's own schema message while it is being typed, so a half-typed
 * code is flagged before submit with the words the server would use.
 */
export function shortCodeError(shortCode: string): string | null {
  if (!shortCode.trim()) return null;
  const result = CreateGroupRegistrationRequest.shape.missionCardShortCode.safeParse(shortCode);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

/** The queued body before schema validation; a blank card code is omitted. */
export function toGroupRequest(values: GroupValues, stationId: string, idempotencyKey: string) {
  return {
    stationId,
    members: groupMembers(values.counts),
    // Optional. If the card cannot be linked the registrations still
    // stand and only that card's journey goes untracked.
    ...(values.shortCode.trim()
      ? { missionCardShortCode: values.shortCode.trim().toUpperCase() }
      : {}),
    idempotencyKey,
    clientRecordedAt: new Date().toISOString(),
  };
}
