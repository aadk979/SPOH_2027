import { useEffect } from 'react';
import type { MeResponse } from '@spoh/shared';
import { useCurrentSession, useMe } from '@/features/session';
import { Callout, LoadingRows } from '@/shared/ui';
import { CaptureScheduleContents } from './CaptureScheduleContents';
import { ApiError } from '@/shared/lib/apiErrors';
import { useClearCaptureSchedules } from '../queries';
import type { CaptureScheduleControlsInput } from '../model/captureScheduleControls';

export function CaptureScheduleControls(input: CaptureScheduleControlsInput) {
  const me = useMe();
  const session = useCurrentSession();
  const clear = useClearCaptureSchedules();
  const authorised = captureSchedulingIdentity({
    me: me.data,
    personId: session?.volunteerId,
    eventId: input.current.eventId,
  });
  const denied = me.error instanceof ApiError && [401, 403].includes(me.error.status);
  useEffect(() => {
    if (denied || (me.data && !authorised)) {
      clear();
      input.onLockChange(false);
      input.onDenied();
    }
  }, [denied, me.data, authorised, clear, input.onDenied, input.onLockChange]);
  if (!me.data && !me.isError) return <LoadingRows label="Loading event clock" />;
  if (me.isError || !authorised || !me.data?.event.timezone)
    return (
      <Callout tone="alert" role="alert">
        Current event access and clock are unavailable. Reload your session before scheduling.
      </Callout>
    );
  return <CaptureScheduleContents {...input} timezone={me.data.event.timezone} />;
}
function captureSchedulingIdentity(input: { me?: MeResponse; personId?: string; eventId: string }) {
  if (!input.me) return false;
  return (
    input.me.event.id === input.eventId &&
    input.me.volunteer.id === input.personId &&
    input.me.capabilities.includes('config.manage')
  );
}
