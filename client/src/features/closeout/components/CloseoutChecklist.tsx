import type { LifecycleReadinessResponse } from '@spoh/shared';
import { useAllows } from '@/features/session';
import { ButtonLink, Card, CardTitle, Stack } from '@/shared/ui';
import { CloseoutTransition } from './CloseoutTransition';
import { LostFoundCloseout } from './LostFoundCloseout';
import { CloseoutFinish } from './CloseoutFinish';

export function CloseoutChecklist({ readiness }: { readiness: LifecycleReadinessResponse }) {
  const allows = useAllows();
  const phase = readiness.lifecycle.status;
  return (
    <Stack>
      <Card>
        <Stack>
          <CardTitle>1. Close capture</CardTitle>
          <p>
            Closing freezes the final report, closes fallback windows and marks held items
            unclaimed. Eligible pre-close offline captures retain the configured grace period.
          </p>
          {phase === 'LIVE' && allows('Event.Close') ? (
            <CloseoutTransition readiness={readiness} to="CLOSED" />
          ) : (
            <p>Current state: {phase.toLowerCase()}.</p>
          )}
        </Stack>
      </Card>
      <Card>
        <Stack>
          <CardTitle>2. Settle lost and found</CardTitle>
          {phase === 'CLOSED' ? <LostFoundCloseout /> : <p>Complete this after closing.</p>}
          <ButtonLink href="/safety/lost-found" variant="quiet">
            Review item outcomes
          </ButtonLink>
        </Stack>
      </Card>
      <Card>
        <Stack>
          <CardTitle>3. Reconcile fallback records</CardTitle>
          <p>
            Closing ends open windows. Import outstanding paper records within the late-sync grace
            period and check the totals.
          </p>
          <ButtonLink href="/chief/fallback" variant="quiet">
            Review windows and imports
          </ButtonLink>
        </Stack>
      </Card>
      <Card>
        <Stack>
          <CardTitle>4. Review the frozen final report</CardTitle>
          <p>
            The final snapshot records the close. Later sync and corrections appear in the current
            report and retain their audit trail.
          </p>
          <ButtonLink href="/reports">Open final report</ButtonLink>
        </Stack>
      </Card>
      <CloseoutFinish readiness={readiness} />
    </Stack>
  );
}
