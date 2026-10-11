import type { LifecycleReadinessResponse } from '@spoh/shared';
import { ArchiveExportPanel } from '@/features/reports';
import { useAllows } from '@/features/session';
import { ButtonLink, Card, CardTitle, Stack } from '@/shared/ui';
import { CloseoutTransition } from './CloseoutTransition';

export function CloseoutFinish({ readiness }: { readiness: LifecycleReadinessResponse }) {
  const allows = useAllows();
  return (
    <>
      <Card>
        <CardTitle>5. Save the archive export pack</CardTitle>
        <ArchiveExportPanel />
      </Card>
      <Card>
        <Stack>
          <CardTitle>6. Archive when the guards pass</CardTitle>
          <p>
            Archiving ends memberships, makes the event read-only and starts the documented
            retention timers. The server checks purge, report and late-sync readiness again.
          </p>
          {readiness.lifecycle.status === 'CLOSED' && allows('Event.Archive') ? (
            <CloseoutTransition readiness={readiness} to="ARCHIVED" />
          ) : (
            <p>Archiving follows the closed state and requires platform authority.</p>
          )}
        </Stack>
      </Card>
      <Card>
        <Stack>
          <CardTitle>7. Start the next event</CardTitle>
          <p>
            Copy this event’s chosen structure into a new draft. Capture data and attendance stay
            with this event.
          </p>
          <ButtonLink href={`/events?clone=${encodeURIComponent(readiness.lifecycle.eventId)}`}>
            Start a new event from this one
          </ButtonLink>
        </Stack>
      </Card>
    </>
  );
}
