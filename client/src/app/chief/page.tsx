'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { BarRow, StatTile } from '@/components/dashboard/StatTile';
import { useLiveDashboard } from '@/features/dashboard/useDashboard';
import { useRequireSession } from '@/features/session/useSession';

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
      title="Live operations"
      back={{ href: '/home', label: 'Home' }}
      actions={
        <Link href="/tv" className="pill-quiet">
          TV mode
        </Link>
      }
    >
      {isError ? (
        <p className="tile" style={{ color: 'var(--color-alert)' }}>
          The dashboard could not be loaded. Capture is unaffected — volunteers keep working.
        </p>
      ) : isLoading || !data ? (
        <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
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
    <div className="flex flex-col gap-6">
      <AttentionPanel data={data} />

      <section>
        <SectionHeading>Today — {data.eventDayLabel ?? 'not an event day'}</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-3">
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
        </div>
      </section>

      <section>
        <SectionHeading>Who is arriving</SectionHeading>
        <div className="tile flex flex-col gap-2">
          {data.registrations.byCategory.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Nothing recorded yet today.</p>
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
        </div>
      </section>

      <section>
        <SectionHeading>Room entries by station</SectionHeading>
        <div className="tile flex flex-col gap-2">
          {data.footfall.stations.map((station) => (
            <BarRow
              key={station.stationId}
              label={`${station.stationName}${station.silent ? ' · silent' : ''}`}
              value={station.todayTotal}
              max={maxStation}
              muted={station.silent}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading>Mission Card funnel — cards, not people</SectionHeading>
        <div className="tile flex flex-col gap-2">
          {data.cards.stages.map((stage) => (
            <BarRow
              key={stage.key}
              label={stage.label}
              value={stage.value}
              max={maxStage}
              suffix={stage.key === 'issued' ? '' : ` · ${Math.round(stage.rateOfIssued * 100)}%`}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionHeading>Gift stock</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-3">
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
        </div>
      </section>

      <section>
        <SectionHeading>Staffing</SectionHeading>
        <div className="grid gap-3 sm:grid-cols-2">
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
        </div>

        {data.staffing.gaps.length > 0 ? (
          <ul className="tile mt-3 flex flex-col gap-1">
            {data.staffing.gaps.map((gap) => (
              <li key={`${gap.stationId}:${gap.block}`}>
                <strong>{gap.stationName}</strong>{' '}
                <span style={{ color: 'var(--text-muted)' }}>
                  {gap.severity === 'UNSTAFFED'
                    ? 'nobody rostered'
                    : gap.severity === 'NOBODY_CHECKED_IN'
                      ? `${gap.assigned} rostered, none checked in`
                      : `${gap.missing} of ${gap.assigned} missing`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {data.staffing.longShifts.length > 0 ? (
          <div className="tile mt-3">
            <p className="mb-2 font-semibold" style={{ color: 'var(--color-warn)' }}>
              On station three hours or more, no break recorded
            </p>
            <ul className="flex flex-col gap-1">
              {data.staffing.longShifts.map((warning) => (
                <li key={warning.volunteerId}>
                  {warning.volunteerName} — {warning.stationName},{' '}
                  {Math.floor(warning.minutesOnStation / 60)}h{warning.minutesOnStation % 60}m
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
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
      text: `${station.stationName} has recorded nothing for ${station.minutesSinceLastActivity ?? '—'} minutes`,
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
      <p className="tile" style={{ color: 'var(--color-ok)' }}>
        {data.dataHealth.withinEventHours
          ? 'Every counted room is reporting. Nothing needs attention.'
          : 'Outside event hours. Silence is expected.'}
      </p>
    );
  }

  return (
    <section
      className="tile"
      style={{ borderLeft: '4px solid var(--color-alert)' }}
      aria-label="Needs attention"
    >
      <h2 className="mb-2 font-semibold">Needs attention</h2>
      <ul className="flex flex-col gap-1">
        {problems.map((problem) => (
          <li key={problem.text} style={{ color: `var(--color-${problem.tone})` }}>
            {/* An icon and words, never colour alone. */}
            <span aria-hidden="true">{problem.tone === 'alert' ? '■ ' : '▲ '}</span>
            {problem.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

function SectionHeading({ children }: { children: ReactNode }): ReactNode {
  return (
    <h2
      className="mb-3 text-sm font-semibold uppercase tracking-wide"
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </h2>
  );
}

export function readableCategory(key: string): string {
  const labels: Record<string, string> = {
    SEC_1: 'Sec 1',
    SEC_2: 'Sec 2',
    SEC_3: 'Sec 3',
    SEC_4: 'Sec 4',
    SEC_5: 'Sec 5',
    GRADUATED_AWAITING_RESULTS: 'Graduated',
    PARENT_GUARDIAN: 'Parent / Guardian',
    OTHER: 'Other',
  };
  return labels[key] ?? key;
}
