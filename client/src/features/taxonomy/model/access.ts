import type { MeResponse } from '@spoh/shared';
import { ApiError } from '@/shared/lib/apiErrors';

export function categorySchedulingIdentity(
  me: MeResponse | undefined,
  personId: string | undefined,
  eventId: string,
) {
  return (
    !!me &&
    !!personId &&
    me.event?.id === eventId &&
    me.volunteer?.id === personId &&
    !!me.capabilities?.includes('config.manage')
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
