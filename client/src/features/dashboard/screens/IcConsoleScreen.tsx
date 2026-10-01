'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/shared/shell/AppShell';
import { Field, Select, Stack } from '@/shared/ui';
import { SwapQueue } from '../components/SwapQueue';
import { StationBoard } from '../components/StationBoard';
import { useIcConsole } from '../hooks/useIcConsole';
import { RehearsalDashboardControl } from '../components/RehearsalDashboardControl';

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
  const {
    session,
    stations,
    selected,
    setStationId,
    dashboard,
    canDecideSwaps,
    swaps,
    includeRehearsal,
    setIncludeRehearsal,
  } = useIcConsole();
  if (!session) return null;

  return (
    <AppShell width="wide" title="IC console" back={{ href: '/home', label: 'Home' }}>
      <Stack>
        <RehearsalDashboardControl included={includeRehearsal} onChange={setIncludeRehearsal} />
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

        <StationBoard board={dashboard.data} selected={selected} />

        {canDecideSwaps ? (
          <SwapQueue swaps={swaps.data ?? []} onDecided={() => void swaps.refetch()} />
        ) : null}
      </Stack>
    </AppShell>
  );
}
