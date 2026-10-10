import type { MeResponse } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';

/** `mayManage`: the policies allow `Schedule.Manage` (from `/me/permissions`). */
export function categorySchedulingIdentity(input: {
  me: MeResponse | undefined;
  personId: string | undefined;
  eventId: string;
  mayManage: boolean;
}) {
  const { me, personId, eventId, mayManage } = input;
  return (
    !!me && !!personId && me.event?.id === eventId && me.volunteer?.id === personId && mayManage
  );
}
export function categoryAccessDenied(error: unknown) {
  return error instanceof ApiError && [401, 403].includes(error.status);
}
export function categoryClock(me: MeResponse | undefined) {
  return me?.event?.timezone ?? '';
}
export function categoryAccessUnavailable(input: {
  authorised: boolean;
  accessLost: boolean;
  timezone: string;
}) {
  return !input.authorised || input.accessLost || !input.timezone;
}
