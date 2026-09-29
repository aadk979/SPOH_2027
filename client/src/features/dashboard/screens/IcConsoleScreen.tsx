'use client';
import { SwapQueue } from '../components/SwapQueue';
import { StationCategories } from '../components/StationCategories';
import { StationRoster } from '../components/StationRoster';
import { StationCounters } from '../components/StationCounters';
import { DeviceRegistrations } from '../components/DeviceRegistrations';
import { StationTotals } from '../components/StationTotals';

import { useStations } from '@/features/stations';

import { useState, type ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { EmptyState, Field, LoadingCards, Select, Stack } from '@/shared/ui';
import { useStationDashboard } from '@/features/dashboard';
import { useMe, useRequireSession } from '@/features/session';
import { usePendingSwaps } from '@/features/roster';
import { defaultStationId } from '../model/defaultStation';

/**
 * The IC console (remediation/phases/P07-client-refactor.md).
 *
 * The per-device breakdown is the reason this screen exists. Two volunteers
 * working the same queue can see each other's totals, so a discrepancy shows up
 * while it can still be explained rather than during reconciliation a week
 * later. The per-minute rate is there for the same reason: an implausible spike
 * usually means somebody is tapping to catch up.
 */
export default function IcConsoleScreen(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const [stationId, setStationId] = useState<string | null>(null);

  const stations = useStations(session !== null);

  const selected = stationId ?? defaultStationId(me);
  const dashboard = useStationDashboard(selected);

  const swaps = usePendingSwaps(session !== null);

  if (!session) return null;

  const board = dashboard.data;

  return (
    <AppShell width="wide" title="IC console" back={{ href: '/home', label: 'Home' }}>
      <Stack>
        {/*
          The picker is capped at a phone's width even on a console. A select
          stretched across 1600px puts its chevron a full head-turn away from
          its label.
        */}
        <Field id="station" label="Station" className="max-w-picker">
          {(props) => (
            <Select
              {...props}
              value={selected ?? ''}
              onChange={(event) => setStationId(event.target.value)}
            >
              <option value="">Choose a station…</option>
              {(stations.data ?? []).map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {board ? (
          <>
            <StationTotals board={board} />

            <div className="grid gap-lg lg:grid-cols-2">
              {board.registrations.byDevice.length > 0 ? (
                <DeviceRegistrations board={board} />
              ) : null}

              {board.footfall.contributors.length > 0 ? <StationCounters board={board} /> : null}

              <StationRoster board={board} />

              <StationCategories board={board} />
            </div>
          </>
        ) : selected ? (
          <LoadingCards count={3} label="Loading station numbers" />
        ) : (
          <EmptyState title="Choose a station">
            Pick a station above to see its numbers, its roster and its per-device totals.
          </EmptyState>
        )}

        <SwapQueue swaps={swaps.data ?? []} onDecided={() => void swaps.refetch()} />
      </Stack>
    </AppShell>
  );
}
