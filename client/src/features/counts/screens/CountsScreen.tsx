'use client';
import { useCallback, useState, type ReactNode } from 'react';
import { useAllows, useRequireSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { usePrivateReadFailure } from '@/shared/hooks/usePrivateReadFailure';
import { AppShell } from '@/shared/shell/AppShell';
import { Button, ButtonLink, Callout, LoadingRows, Section, Stack, ErrorState, ControlHelp, PermissionDenied } from '@/shared/ui';
import { AppLink } from '@/shared/lib/AppLink';
import { entityPath, recordsPath } from '@/shared/lib/workspacePath';
import { footfallLink, cardStageLink, giftLedgerLink, giftRedemptionsLink, staffingLink } from '@/features/dashboard';
import { useCountViews, useDataHealth } from '../queries';
export default function CountsScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const eventId = useEventId();
  if (!session) return null;
  return (
    <AppShell title="Counts and data health" back={{ href: '/operations', label: 'Operations' }}>
      <Stack>
        <ControlHelp topic="three-counts">
          Registrations count people; room entries count visits; cards count journeys. Keep these
          units separate.
        </ControlHelp>
        <ButtonLink href="/reports" variant="quiet">
          Registration totals and historical reports
        </ButtonLink>
        {allows('Dashboard.ReadStation') ? (
          <CountReadBoundary key={`${eventId}:${session.volunteerId}:counts`}>
            {(onDenied) => <CountPanel onDenied={onDenied} />}
          </CountReadBoundary>
        ) : (
          <Callout>Your event permission does not allow these counts.</Callout>
        )}
        {allows('Dashboard.ReadEvent') ? (
          <CountReadBoundary key={`${eventId}:${session.volunteerId}:health`}>
            {(onDenied) => <HealthPanel onDenied={onDenied} />}
          </CountReadBoundary>
        ) : null}
      </Stack>
    </AppShell>
  );
}
function CountReadBoundary({ children }: { children(onDenied: () => void): ReactNode }) {
  const [denied, setDenied] = useState(false);
  const onDenied = useCallback(() => setDenied(true), []);
  return denied ? (
    <Callout role="alert">This read is no longer permitted. Reload your session.</Callout>
  ) : (
    children(onDenied)
  );
}
function CountPanel({ onDenied }: { onDenied(): void }) {
  const counts = useCountViews(true);
  usePrivateReadFailure(counts.error, onDenied);
  return (
    <>
      {counts.isPending ? <LoadingRows /> : null}
      {counts.error ? (
        <ErrorState error={counts.error}><Button onClick={() => void counts.refetch()}>Retry counts</Button></ErrorState>
      ) : null}
      {counts.data && !counts.error ? <CountDetails data={counts.data} /> : null}
    </>
  );
}
function HealthPanel({ onDenied }: { onDenied(): void }) {
  const health = useDataHealth(true);
  usePrivateReadFailure(health.error, onDenied);
  return (
    <>
      {health.isPending ? <LoadingRows /> : null}
      {health.error ? (
        <ErrorState error={health.error}><Button onClick={() => void health.refetch()}>Retry data health</Button></ErrorState>
      ) : null}
      {health.data && !health.error ? <HealthDetails data={health.data} /> : null}
    </>
  );
}
function CountDetails({ data }: { data: NonNullable<ReturnType<typeof useCountViews>['data']> }) {
  return (
    <>
      <Section title="Room entries">
        <CountFigure href={recordsPath({ kind: 'footfall', includeRehearsal: data.footfall.rehearsalIncluded ?? false, voided: false })}>{data.footfall.total} room entries in the summary.</CountFigure>
        {data.live.stations.map((station) => (
          <CountFigure key={station.stationId} href={footfallLink(data.live.observation, { stationId: station.stationId })}>
            {station.stationName}: {station.todayTotal} today · {station.activeCounterCount} active
            counters · {station.silent ? 'Check this station' : 'Recording'}
          </CountFigure>
        ))}
      </Section>
      <Section title="Card journeys">
        {data.cards.stages.map((stage) => (
          <CountFigure key={stage.key} href={cardStageLink(stage, data.cards.observation)}>
            {stage.label}: {stage.value} journeys
          </CountFigure>
        ))}
      </Section>
      <Section title="Gift redemptions">
        <CountFigure href={data.gifts.asOf && data.gifts.rehearsal !== undefined ? recordsPath({ kind: 'redemptions', rehearsal: data.gifts.rehearsal, asOf: data.gifts.asOf, voided: false }) : undefined}>{data.gifts.total} gifts redeemed.</CountFigure>
        {data.gifts.byGiftType.map((gift) => (
          <p key={gift.giftTypeId}><InlineFigure href={data.gifts.asOf ? giftRedemptionsLink(gift.giftTypeId, data.gifts.rehearsal, data.gifts.asOf) : undefined}>{gift.giftTypeName}: {gift.redeemed} redeemed</InlineFigure>, <InlineFigure href={data.gifts.asOf ? giftLedgerLink(gift.giftTypeId, data.gifts.rehearsal, data.gifts.asOf) : undefined}>{gift.remaining} remaining</InlineFigure></p>
        ))}
        <ButtonLink href="/admin/gifts">Review stock</ButtonLink>
      </Section>
    </>
  );
}
function HealthDetails({ data }: { data: NonNullable<ReturnType<typeof useDataHealth>['data']> }) {
  return (
    <Section title="Data health">
      <p>
        {data.withinEventHours
          ? 'Event hours are running.'
          : 'Outside event hours; silence is expected.'}
      </p>
      <CountFigure href={recordsPath({ kind: 'fallback', open: data.fallbackWindowOpen, asOf: data.asOf, includeRehearsal: data.rehearsalIncluded ?? false })}>
        {data.fallbackWindowOpen
          ? 'Fallback is open; reconcile paper records.'
          : 'No open fallback window.'}
      </CountFigure>
      {data.silentStations.map((station) => (
        <CountFigure key={station.stationId} href={entityPath({ kind: 'station', id: station.stationId })}>
          {station.stationName}: no recent count. Check the assigned counter.
        </CountFigure>
      ))}
      {['available', 'partial'].includes(data.rosterAvailability ?? 'denied') ? data.staleDevices.map((device) => (
        <CountFigure key={device.volunteerId} href={device.assignmentId ? entityPath({ kind: 'assignment', id: device.assignmentId }) : undefined}>
          {device.volunteerName} at {device.stationName}: no recent capture.
        </CountFigure>
      )) : <PermissionDenied>Named recorder checks are unavailable under your current roster permission.</PermissionDenied>}
      {data.staffing?.gaps.map((gap) => (
        <CountFigure key={`${gap.stationId}-${gap.shift.id}`} href={staffingLink(data.observation, 'gaps', { stationId: gap.stationId, shiftId: gap.shift.id })}>
          {gap.stationName} · {gap.shift.label}: {gap.checkedIn} checked in of {gap.assigned}{' '}
          assigned · {gap.missing} missing.
        </CountFigure>
      ))}
      <ButtonLink href="/admin/staffing">Check staffing</ButtonLink>
      <ButtonLink href="/admin/corrections" variant="quiet">
        Correct counts
      </ButtonLink>
    </Section>
  );
}
function CountFigure({ href, children }: { href?: string; children: ReactNode }) {
  return <p><InlineFigure href={href}>{children}</InlineFigure></p>;
}
function InlineFigure({ href, children }: { href?: string; children: ReactNode }) {
  return href ? <AppLink href={href} className="text-primary underline">{children}</AppLink> : <>{children}</>;
}
