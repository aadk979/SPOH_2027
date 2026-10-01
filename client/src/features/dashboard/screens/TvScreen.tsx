'use client';
import { TvStat } from '../components/TvPrimitives';
import { useTvWakeLock } from '../hooks/useTvWakeLock';
import { TvWarnings } from '../components/TvWarnings';
import { TvBreakdowns } from '../components/TvBreakdowns';
import { TvAlerts } from '../components/TvAlerts';

import { type ReactNode } from 'react';
import { useLiveDashboard } from '@/features/dashboard';
import { useRequireSession, useEventTime } from '@/features/session';
import { AppLink } from '@/shared/lib/AppLink';
import { useEvent } from '@/shared/lib/eventContext';

/**
 * TV mode — the ops-room display (remediation/phases/P07-client-refactor.md).
 *
 * A different problem from the phone dashboard: read from four metres away, by
 * people walking past, never interacted with. So it is dark, enormous, has no
 * navigation at all, and holds a wake lock so nobody has to nudge a mouse every
 * ten minutes.
 *
 * Anything wrong takes the whole top of the screen. The point of a display
 * nobody is looking at is that it catches your eye when it needs to.
 *
 * The type scale here is viewport-relative rather than fixed. The ops room may
 * put this on a 1080p panel or a 4K one, and a fixed 72px figure is half the
 * physical size on the second — the numbers have to stay the same size on the
 * wall, not the same size in pixels.
 */
export default function TvScreen(): ReactNode {
  const format = useEventTime();
  const event = useEvent();
  const session = useRequireSession();
  const { data } = useLiveDashboard();

  useTvWakeLock();

  if (!session) return null;

  if (!data) {
    return (
      <main
        // `data-theme` rather than a pile of colour classes: this screen is
        // permanently dark whatever the browser's preference, and setting the
        // theme means every token beneath it already resolves correctly.
        data-theme="dark"
        className="flex min-h-dvh items-center justify-center bg-void text-on-dark"
      >
        <p className="text-tv-row">Connecting…</p>
      </main>
    );
  }

  return (
    <main
      data-theme="dark"
      className="flex min-h-dvh flex-col gap-[2vw] bg-void p-[2vw] text-on-dark"
    >
      <TvAlerts data={data} />

      <header className="flex flex-wrap items-baseline justify-between gap-sm">
        <div className="flex items-baseline gap-sm">
          <h1 className="text-tv-row font-semibold">
            {`${event.name} · ${data.eventDayLabel ?? 'Ops'}`}
          </h1>
          <AppLink
            href="/chief"
            className="rounded-sm bg-tile-dark px-sm py-xxs text-caption text-on-dark-muted no-underline hover:text-on-dark focus-visible:outline-primary-on-dark"
          >
            Exit TV mode
          </AppLink>
        </div>
        <p className="text-tv-row tabular-nums text-on-dark-muted">{format.time(data.asOf)}</p>
      </header>

      {data.headline ? (
        <TvStat
          label="Visitors"
          value={data.headline.value}
          unit={`${data.headline.sourceLabel} · one of the three below, not their sum`}
        />
      ) : null}

      <div className="grid gap-[1.5vw] sm:grid-cols-3">
        <TvStat label="Registered" value={data.registrations.todayTotal} unit="registrations" />
        <TvStat label="Room entries" value={data.footfall.todayTotal} unit="entries, not people" />
        <TvStat
          label="Cards issued"
          value={data.cards.issued}
          unit={`${data.cards.completed} completed`}
        />
      </div>

      {/*
        `min-h-0` on the two panels: without it a long station list stretches
        the grid past the viewport and the footer warning scrolls off a display
        nobody can scroll.
      */}
      <TvBreakdowns data={data} />

      <TvWarnings data={data} />
    </main>
  );
}
