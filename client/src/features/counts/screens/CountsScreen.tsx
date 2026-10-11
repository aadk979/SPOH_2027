'use client';
import { useCallback, useState, type ReactNode } from 'react';
import { useAllows, useRequireSession } from '@/features/session';
import { useEventId } from '@/shared/lib/eventContext';
import { usePrivateReadFailure } from '@/shared/hooks/usePrivateReadFailure';
import { AppShell } from '@/shared/shell/AppShell';
import { Button, ButtonLink, Callout, LoadingRows, Section, Stack } from '@/shared/ui';
import { useCountViews, useDataHealth } from '../queries';
export default function CountsScreen() {
  const session = useRequireSession();
  const allows = useAllows();
  const eventId = useEventId();
  if (!session) return null;
  return (
    <AppShell title="Counts and data health" back={{ href: '/operations', label: 'Operations' }}>
      <Stack>
        <Callout>
          Registrations count people; room entries count visits; cards count journeys. Keep these
          units separate.
        </Callout>
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
        <Callout role="alert">
          {counts.error.message}
          <Button onClick={() => void counts.refetch()}>Retry counts</Button>
        </Callout>
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
        <Callout role="alert">
          {health.error.message}
          <Button onClick={() => void health.refetch()}>Retry data health</Button>
        </Callout>
      ) : null}
      {health.data && !health.error ? <HealthDetails data={health.data} /> : null}
    </>
  );
}
function CountDetails({ data }: { data: NonNullable<ReturnType<typeof useCountViews>['data']> }) {
  return (
    <>
      <Section title="Room entries">
        <p>{data.footfall.total} room entries in the summary.</p>
        {data.live.stations.map((station) => (
          <p key={station.stationId}>
            {station.stationName}: {station.todayTotal} today · {station.activeCounterCount} active
            counters · {station.silent ? 'Check this station' : 'Recording'}
          </p>
        ))}
      </Section>
      <Section title="Card journeys">
        {data.cards.stages.map((stage) => (
          <p key={stage.key}>
            {stage.label}: {stage.value} journeys
          </p>
        ))}
      </Section>
      <Section title="Gift redemptions">
        <p>{data.gifts.total} gifts redeemed.</p>
        {data.gifts.byGiftType.map((gift) => (
          <p key={gift.giftTypeId}>
            {gift.giftTypeName}: {gift.redeemed} redeemed, {gift.remaining} remaining
          </p>
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
      <p>
        {data.fallbackWindowOpen
          ? 'Fallback is open; reconcile paper records.'
          : 'No open fallback window.'}
      </p>
      {data.silentStations.map((station) => (
        <p key={station.stationId}>
          {station.stationName}: no recent count. Check the assigned counter.
        </p>
      ))}
      {data.staleDevices.map((device) => (
        <p key={device.volunteerId}>
          {device.volunteerName} at {device.stationName}: no recent capture.
        </p>
      ))}
      {data.staffing.gaps.map((gap) => (
        <p key={`${gap.stationId}-${gap.shift.id}`}>
          {gap.stationName} · {gap.shift.label}: {gap.checkedIn} checked in of {gap.assigned}{' '}
          assigned · {gap.missing} missing.
        </p>
      ))}
      <ButtonLink href="/admin/staffing">Check staffing</ButtonLink>
      <ButtonLink href="/admin/corrections" variant="quiet">
        Correct counts
      </ButtonLink>
    </Section>
  );
}
