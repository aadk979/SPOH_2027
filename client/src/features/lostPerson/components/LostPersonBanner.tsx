'use client';
import { useState, type ReactNode } from 'react';
import { useAcknowledgeAlert, useActiveAlerts, useResolveAlert } from '@/features/lostPerson';
import { useAllows, useCurrentSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { LostPersonAlert } from './LostPersonAlert';
import { ErrorState, PrivateReadBoundary } from '@/shared/ui';
import { usePrivateReadFailure } from '@/shared/hooks/usePrivateReadFailure';

/** One urgent summary remains reachable without covering the phone's capture controls. */
export function LostPersonBanner(): ReactNode {
  const session = useCurrentSession();
  const eventId = useEventId();
  const allows = useAllows();
  return session && allows('Self.Read')
    ? <PrivateReadBoundary key={`${eventId}:${session.volunteerId}`} silent>{(onDenied) => <OwnedBanner onDenied={onDenied} />}</PrivateReadBoundary> : null;
}

function OwnedBanner({ onDenied }: { onDenied(): void }): ReactNode {
  const query = useActiveAlerts();
  usePrivateReadFailure(query.error, onDenied);
  const acknowledge = useAcknowledgeAlert();
  const resolve = useResolveAlert();
  const allows = useAllows();
  const [expanded, setExpanded] = useState(false);
  if (query.error || !query.data) return null;
  const alerts = [...query.data.alerts].sort((a, b) => b.raisedAt.localeCompare(a.raisedAt) || b.id.localeCompare(a.id));
  const newest = alerts[0];
  if (!newest) return null;
  return <section aria-label="Lost person alerts" className="max-h-[45dvh] overflow-y-auto bg-alert-solid text-on-alert shadow-[var(--shadow-lift)]">
    <div className="flex items-center justify-between gap-sm px-md py-sm">
      <p role="alert" aria-live="assertive" className="font-semibold">{alerts.length} active lost-person {alerts.length === 1 ? 'alert' : 'alerts'} · Newest: {newest.descriptionText}</p>
      <button type="button" className="min-h-control shrink-0 rounded-pill border border-on-alert px-sm" aria-expanded={expanded} aria-controls="lost-person-expanded" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Collapse alerts' : 'View alerts'}</button>
    </div>
    {expanded ? <div id="lost-person-expanded">
      {alerts.map((alert) => <LostPersonAlert key={alert.id} alert={alert} acknowledge={acknowledge} resolve={resolve} canResolve={allows('LostPerson.Resolve')} />)}
      {acknowledge.error || resolve.error ? <ErrorState error={acknowledge.error ?? resolve.error} operation="Updating this alert" /> : null}
    </div> : null}
  </section>;
}
