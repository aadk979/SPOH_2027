'use client';

import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { BarList, BarRow, StatTile } from '@/components/dashboard/StatTile';
import {
  ButtonLink,
  Callout,
  Card,
  CardGrid,
  CardTitle,
  LoadingCards,
  Section,
  Stack,
} from '@/components/ui';
import { useLiveDashboard } from '@/features/dashboard/useDashboard';
import { useRequireSession } from '@/features/session/useSession';
import { formatDuration, readableCategory } from '@/lib/format';

/**
 * The live operations dashboard (PRODUCT_BRIEF §9).
 *
 * Built for glancing at while walking. The order is the order of urgency: what
 * is broken, then what is happening, then the numbers.
 *
 * There is no combined "total visitors" figure anywhere on this page. Every
 * count states its unit, because a registration, a room entry and a card
 * measure three different things and adding them produces a number that means
 * nothing.
 */
export default function ChiefDashboardPage(): ReactNode {
  const session = useRequireSession();
  const { data, isLoading, isError } = useLiveDashboard();

  if (!session) return null;

  return (
    <AppShell
      width="wide"
      title="Live operations"
      back={{ href: '/home', label: 'Home' }}
      actions={
        <ButtonLink href="/tv" variant="quiet" size="sm">
          TV mode
        </ButtonLink>
      }
    >
      {isError ? (
        <Callout tone="alert" title="The dashboard could not be loaded">
          Capture is unaffected — volunteers keep working.
        </Callout>
      ) : isLoading || !data ? (
        <LoadingCards count={3} label="Loading live operations" />
      ) : (
        <DashboardBody data={data} />
      )}
    </AppShell>
  );
}

function DashboardBody({ data }: { data: LiveDashboardResponse }): ReactNode {
  const maxCategory = Math.max(1, ...data.registrations.byCategory.map((row) => row.value));
  const maxStation = Math.max(1, ...data.footfall.stations.map((row) => row.todayTotal));
  const maxStage = Math.max(1, ...data.cards.stages.map((row) => row.value));

  return (
    <Stack>
      <AttentionPanel data={data} />

      <Section title={`Today — ${data.eventDayLabel ?? 'not an event day'}`}>
        <CardGrid>
          <StatTile
            label="Registered"
            value={data.registrations.todayTotal}
            unit="registrations"
            note={`${data.registrations.lastHour} in the last hour`}
          />
          <StatTile
            label="Room entries"
            value={data.footfall.todayTotal}
            unit="room entries — not people"
          />
          <StatTile
            label="Cards issued"
            value={data.cards.issued}
            unit="cards — a card can be a family"
            note={`${data.cards.completed} completed`}
          />
        </CardGrid>
      </Section>

      {/*
        Two columns from `lg` up. These four bar panels are the bulk of the
        page, and stacked on a 1600px console they were four short charts in a
        1600px-wide column with an enormous amount of scrolling between them.
      */}
      <div className="grid gap-lg lg:grid-cols-2">
        <Section title="Who is arriving">
          <BarList>
            {data.registrations.byCategory.length === 0 ? (
              <p className="text-text-muted">Nothing recorded yet today.</p>
            ) : (
              data.registrations.byCategory.map((row) => (
                <BarRow
                  key={row.key}
                  label={readableCategory(row.key)}
                  value={row.value}
                  max={maxCategory}
                />
              ))
            )}
          </BarList>
        </Section>

        <Section title="Room entries by station">
          <BarList>
            {data.footfall.stations.map((station) => (
              <BarRow
                key={station.stationId}
                label={`${station.stationName}${station.silent ? ' · silent' : ''}`}
                value={station.todayTotal}
                max={maxStation}
                muted={station.silent}
              />
            ))}
          </BarList>
        </Section>

        <Section title="Mission Card funnel — cards, not people">
          <BarList>
            {data.cards.stages.map((stage) => (
              <BarRow
                key={stage.key}
                label={stage.label}
                value={stage.value}
                max={maxStage}
                suffix={stage.key === 'issued' ? '' : ` · ${Math.round(stage.rateOfIssued * 100)}%`}
              />
            ))}
          </BarList>
        </Section>

        <Section title="Gift stock">
          <CardGrid columns={2}>
            {data.gifts.map((gift) => (
              <StatTile
                key={gift.id}
                label={gift.name}
                value={gift.remaining}
                unit="remaining"
                note={`${gift.redeemed} redeemed`}
                tone={gift.outOfStock ? 'alert' : gift.lowStock ? 'warn' : 'neutral'}
              />
            ))}
          </CardGrid>
        </Section>
      </div>

      <Section title="Staffing">
        <CardGrid columns={2}>
          <StatTile
            label="On shift"
            value={data.staffing.onShift}
            unit="assignments this block"
            note={`${data.staffing.checkedIn} checked in`}
          />
          <StatTile
            label="Staffing gaps"
            value={data.staffing.gaps.length}
            unit="stations needing attention"
            tone={data.staffing.gaps.length > 0 ? 'warn' : 'ok'}
          />
        </CardGrid>

        {data.staffing.gaps.length > 0 ? (
          // Columns, because this is a flat list of short lines: sixteen of
          // them down a single 1400px column was one phrase per row and a
          // screenful of scrolling to read what fits in a third of the height.
          <Card as="ul" className="mt-sm grid gap-x-lg gap-y-xxs sm:grid-cols-2 xl:grid-cols-3">
            {data.staffing.gaps.map((gap) => (
              <li key={`${gap.stationId}:${gap.block}`}>
                <strong>{gap.stationName}</strong>{' '}
                <span className="text-text-muted">
                  {gap.severity === 'UNSTAFFED'
                    ? 'nobody rostered'
                    : gap.severity === 'NOBODY_CHECKED_IN'
                      ? `${gap.assigned} rostered, none checked in`
                      : `${gap.missing} of ${gap.assigned} missing`}
                </span>
              </li>
            ))}
          </Card>
        ) : null}

        {data.staffing.longShifts.length > 0 ? (
          <Card tone="warn" className="mt-sm">
            <h3 className="text-body font-semibold text-warn">
              On station three hours or more, no break recorded
            </h3>
            <ul className="mt-xs flex flex-col gap-xxs text-text-muted">
              {data.staffing.longShifts.map((warning) => (
                <li key={warning.volunteerId}>
                  {warning.volunteerName} — {warning.stationName},{' '}
                  {formatDuration(warning.minutesOnStation)}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </Section>

      {/*
        Last, deliberately. This screen is read while walking and its order is
        the order of urgency — what is broken, what is happening, then the
        numbers. Administration is none of those: it is what you open on a
        laptop the week before, and putting it above a staffing gap would be
        putting furniture in front of a fire door.
      */}
      <Section title="Administration">
        <div className="flex flex-wrap gap-sm">
          <ButtonLink href="/admin/users" variant="secondary" size="sm">
            Volunteers
          </ButtonLink>
          <ButtonLink href="/admin/settings" variant="secondary" size="sm">
            Event settings
          </ButtonLink>
          <ButtonLink href="/chief/fallback" variant="secondary" size="sm">
            Fallback
          </ButtonLink>
          <ButtonLink href="/chief/imports" variant="secondary" size="sm">
            Reconciliation
          </ButtonLink>
          <ButtonLink href="/reports" variant="secondary" size="sm">
            Post-event report
          </ButtonLink>
        </div>
      </Section>
    </Stack>
  );
}

/**
 * Everything wrong, at the top, before any number.
 *
 * The data-health block is the important half. The API can be perfectly healthy
 * while a room records nothing for an hour, and no total on this page would
 * ever reveal it.
 */
function AttentionPanel({ data }: { data: LiveDashboardResponse }): ReactNode {
  const problems: Array<{ text: string; tone: 'alert' | 'warn' }> = [];

  if (data.safety.activeLostPersonAlerts > 0) {
    problems.push({
      text: `${data.safety.activeLostPersonAlerts} active lost-person alert${data.safety.activeLostPersonAlerts === 1 ? '' : 's'}`,
      tone: 'alert',
    });
  }

  if (data.safety.criticalIncidents > 0) {
    problems.push({
      text: `${data.safety.criticalIncidents} critical incidents open`,
      tone: 'alert',
    });
  }

  if (data.dataHealth.fallbackWindowOpen) {
    problems.push({ text: 'A fallback window is open — data is degraded', tone: 'warn' });
  }

  for (const station of data.dataHealth.silentStations) {
    problems.push({
      text:
        station.minutesSinceLastActivity === null
          ? `${station.stationName} has recorded nothing at all today`
          : `${station.stationName} has recorded nothing for ${station.minutesSinceLastActivity} minutes`,
      tone: 'warn',
    });
  }

  for (const device of data.dataHealth.staleDevices) {
    problems.push({
      text: `${device.volunteerName} (${device.stationName}) is checked in but has recorded nothing`,
      tone: 'warn',
    });
  }

  if (data.safety.openIncidents > 0) {
    problems.push({ text: `${data.safety.openIncidents} incidents open`, tone: 'warn' });
  }

  if (problems.length === 0) {
    return (
      <Callout tone="ok">
        {data.dataHealth.withinEventHours
          ? 'Every counted room is reporting. Nothing needs attention.'
          : 'Outside event hours. Silence is expected.'}
      </Callout>
    );
  }

  return (
    <Card tone={problems.some((problem) => problem.tone === 'alert') ? 'alert' : 'warn'}>
      <CardTitle>Needs attention</CardTitle>
      <ul className="mt-xs flex flex-col gap-xxs">
        {problems.map((problem) => (
          <li key={problem.text} className={problem.tone === 'alert' ? 'text-alert' : 'text-warn'}>
            {/* An icon and words, never colour alone. */}
            <span aria-hidden="true" className="mr-xs">
              {problem.tone === 'alert' ? '■' : '▲'}
            </span>
            {problem.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}
