import { useState } from 'react';
import { useCurrentSession } from '@/features/session';
import { Button, Callout, Card, LoadingRows, Section } from '@/shared/ui';
import { useLifecycleReadiness } from '../queries';
import { LifecycleReview } from './LifecycleReview';

/** Event configuration managers review authoritative guards before choosing an audited transition. */
export function LifecyclePanel({ enabled }: { enabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const session = useCurrentSession();
  const readiness = useLifecycleReadiness(enabled && expanded);
  if (!enabled || !session) return null;
  return (
    <Section
      title="Event lifecycle"
      description="Review readiness, start or end rehearsal, and close or reopen the event."
    >
      <Card className="flex flex-col gap-md">
        <Button
          variant="secondary"
          className="hover:bg-surface"
          aria-expanded={expanded}
          aria-controls="event-lifecycle-controls"
          onClick={() => setExpanded(!expanded)}
        >
          Lifecycle and readiness
        </Button>
        {expanded ? (
          <div id="event-lifecycle-controls" className="flex flex-col gap-md">
            {readiness.isPending ? <LoadingRows /> : null}
            {readiness.isError ? (
              <Callout tone="alert" role="alert">
                Lifecycle readiness is unavailable. Reload before making a change.
              </Callout>
            ) : null}
            <Button
              variant="quiet"
              disabled={readiness.isFetching}
              onClick={() => {
                void readiness.refetch();
              }}
            >
              Reload readiness
            </Button>
            {readiness.data && !readiness.isError ? (
              <LifecycleReview
                key={`${readiness.data.lifecycle.eventId}:${session.volunteerId}`}
                readiness={readiness.data}
                loadCurrent={async () => {
                  const current = await readiness.refetch();
                  return current.isError ? null : (current.data ?? null);
                }}
              />
            ) : null}
          </div>
        ) : null}
      </Card>
    </Section>
  );
}
