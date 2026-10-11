'use client';
import { useLifecycleReadiness } from '@/features/events';
import { useAllows, useRequireSession } from '@/features/session';
import { AppShell } from '@/shared/shell/AppShell';
import { Button, Callout, LoadingRows, Stack } from '@/shared/ui';
import { CloseoutChecklist } from '../components/CloseoutChecklist';
import { OpenCloseoutCases } from '../components/OpenCloseoutCases';

export default function CloseoutScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const enabled = allows('Event.Close') || allows('Event.Archive');
  const readiness = useLifecycleReadiness(enabled);
  if (!session) return null;
  return (
    <AppShell title="After the event" width="wide" back={{ href: '/overview', label: 'Overview' }}>
      <Stack>
        {!enabled ? (
          <Callout>Close-out is available to authorised event leaders.</Callout>
        ) : (
          <>
            <OpenCloseoutCases />
            <Button
              variant="secondary"
              disabled={readiness.isFetching}
              onClick={() => void readiness.refetch()}
            >
              Reload close-out readiness
            </Button>
            {readiness.isPending ? <LoadingRows /> : null}
            {readiness.error ? (
              <Callout role="alert" tone="alert">
                {readiness.error.message}
              </Callout>
            ) : null}
            {readiness.data && !readiness.isError ? (
              <CloseoutChecklist
                key={readiness.data.lifecycle.version}
                readiness={readiness.data}
              />
            ) : null}
          </>
        )}
      </Stack>
    </AppShell>
  );
}
