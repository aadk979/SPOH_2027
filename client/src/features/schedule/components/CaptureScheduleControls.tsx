import { useEffect } from 'react';
import type { MeResponse } from '@spoh/shared';
import { useCurrentSession, useMe, useMyPermissions } from '@/features/session';
import { Callout, LoadingRows } from '@/shared/ui';
import { CaptureScheduleContents } from './CaptureScheduleContents';
import { ApiError } from '@/shared/lib/apiErrors';
import { useClearCaptureSchedules } from '../queries';
import type { CaptureScheduleControlsInput } from '../model/captureScheduleControls';

export function CaptureScheduleControls(input: CaptureScheduleControlsInput) {
  const access = useCaptureSchedulingAccess(input.current.eventId);
  const clear = useClearCaptureSchedules();
  const { denied, known, authorised } = access;
  useEffect(() => {
    if (denied || (known && !authorised)) {
      clear();
      input.onLockChange(false);
      input.onDenied();
    }
  }, [denied, known, authorised, clear, input.onDenied, input.onLockChange]);
  if (access.loading) return <LoadingRows label="Loading event clock" />;
  if (!access.timezone)
    return (
      <Callout tone="alert" role="alert">
        Current event access and clock are unavailable. Reload your session before scheduling.
      </Callout>
    );
  return <CaptureScheduleContents {...input} timezone={access.timezone} />;
}

/**
 * Both answers are needed: who the caller is and the event's clock from `/me`, and whether the
 * policies let them schedule (`Schedule.Manage`, from `/me/permissions`).
 */
function useCaptureSchedulingAccess(eventId: string) {
  const me = useMe();
  const permissions = useMyPermissions();
  const session = useCurrentSession();
  const authorised = captureSchedulingIdentity({
    me: me.data,
    personId: session?.volunteerId,
    eventId,
    mayManage: permissions.data?.actions['Schedule.Manage'] === true,
  });
  const failed = me.isError || permissions.isError;
  return {
    authorised,
    denied: [me.error, permissions.error].some(isAccessRefusal),
    known: !!me.data && !!permissions.data,
    loading: pending(me) || pending(permissions),
    timezone: !failed && authorised ? me.data?.event.timezone || null : null,
  };
}

/** A query that has neither answered nor failed yet. */
const pending = (query: { data?: unknown; isError: boolean }) => !query.data && !query.isError;

const isAccessRefusal = (error: unknown) =>
  error instanceof ApiError && [401, 403].includes(error.status);

function captureSchedulingIdentity(input: {
  me?: MeResponse;
  personId?: string;
  eventId: string;
  mayManage: boolean;
}) {
  if (!input.me) return false;
  return (
    input.me.event.id === input.eventId &&
    input.me.volunteer.id === input.personId &&
    input.mayManage
  );
}
