'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { StationSummary, SwapRequestRecord } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { BarList, BarRow, StatTile } from '@/components/dashboard/StatTile';
import {
  Button,
  Callout,
  Card,
  CardGrid,
  EmptyState,
  Field,
  LoadingCards,
  Section,
  Select,
  Stack,
  StatusText,
} from '@/components/ui';
import { useStationDashboard } from '@/features/dashboard/useDashboard';
import { useMe, useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';
import { blockWord, readableCategory } from '@/lib/format';

/**
 * The IC console (PRODUCT_BRIEF §2.5).
 *
 * The per-device breakdown is the reason this screen exists. Two volunteers
 * working the same queue can see each other's totals, so a discrepancy shows up
 * while it can still be explained rather than during reconciliation a week
 * later. The per-minute rate is there for the same reason: an implausible spike
 * usually means somebody is tapping to catch up.
 */
export default function IcConsolePage(): ReactNode {
  const session = useRequireSession();
  const { data: me } = useMe();
  const [stationId, setStationId] = useState<string | null>(null);

  const stations = useQuery({
    queryKey: ['stations'],
    queryFn: async () => (await api<{ data: StationSummary[] }>('/stations')).data,
    enabled: session !== null,
    staleTime: 5 * 60_000,
  });

  const selected = stationId ?? me?.currentAssignment?.station.id;
  const dashboard = useStationDashboard(selected);

  const swaps = useQuery({
    queryKey: ['roster', 'swaps', 'pending'],
    queryFn: async () => (await api<{ data: SwapRequestRecord[] }>('/roster/swaps/pending')).data,
    enabled: session !== null,
    refetchInterval: 30_000,
  });

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
            <CardGrid>
              <StatTile
                label="Registered here"
                value={board.registrations.todayTotal}
                unit="registrations"
              />
              <StatTile
                label="Room entries"
                value={board.footfall.todayTotal}
                unit="entries, not people"
              />
              <StatTile label="Cards stamped" value={board.stamps} unit="stamps" />
            </CardGrid>

            <div className="grid gap-lg lg:grid-cols-2">
              {board.registrations.byDevice.length > 0 ? (
                <Section
                  title="Registrations per device"
                  description="Two volunteers on one queue should track each other. A gap that appears here can still be explained; a gap found at reconciliation cannot."
                >
                  <BarList>
                    {board.registrations.byDevice.map((device) => {
                      const max = Math.max(
                        1,
                        ...board.registrations.byDevice.map((row) => row.value),
                      );

                      return (
                        <div key={device.volunteerId}>
                          <BarRow label={device.volunteerName} value={device.value} max={max} />
                          {device.rateAnomaly ? (
                            /*
                              Sits directly under its own bar rather than at a
                              hard-coded 160px indent, which on a phone put the
                              warning under the wrong volunteer entirely.
                            */
                            <p className="mt-xxs text-caption text-warn">
                              <span aria-hidden="true">▲ </span>
                              {device.perMinute}/min — check they are not tapping to catch up
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </BarList>
                </Section>
              ) : null}

              {board.footfall.contributors.length > 0 ? (
                <Section title="Counters contributing">
                  <BarList>
                    {board.footfall.contributors.map((contributor) => (
                      <BarRow
                        key={contributor.volunteerId}
                        label={contributor.volunteerName}
                        value={contributor.value}
                        max={Math.max(1, ...board.footfall.contributors.map((row) => row.value))}
                      />
                    ))}
                  </BarList>
                </Section>
              ) : null}

              <Section title="Who is here">
                <Card as="ul" className="flex flex-col divide-y divide-line-soft">
                  {board.roster.length === 0 ? (
                    <li className="text-text-muted">Nobody rostered here today.</li>
                  ) : (
                    board.roster.map((person) => (
                      <li
                        key={person.volunteerId}
                        className="flex items-center justify-between gap-sm py-xs first:pt-0 last:pb-0"
                      >
                        <span className="min-w-0">
                          <span className="block">{person.volunteerName}</span>
                          <span className="block text-caption text-text-muted">
                            {person.roleLabel}
                          </span>
                        </span>

                        <StatusText
                          tone={
                            person.checkedOutAt ? 'neutral' : person.checkedInAt ? 'ok' : 'warn'
                          }
                          className="shrink-0"
                        >
                          {person.checkedOutAt
                            ? 'Left'
                            : person.checkedInAt
                              ? 'Checked in'
                              : 'Not arrived'}
                        </StatusText>
                      </li>
                    ))
                  )}
                </Card>
              </Section>

              <Section title="Categories">
                <BarList>
                  {board.registrations.byCategory.length === 0 ? (
                    <p className="text-text-muted">Nothing recorded here today.</p>
                  ) : (
                    board.registrations.byCategory.map((row) => (
                      <BarRow
                        key={row.key}
                        label={readableCategory(row.key)}
                        value={row.value}
                        max={Math.max(
                          1,
                          ...board.registrations.byCategory.map((entry) => entry.value),
                        )}
                      />
                    ))
                  )}
                </BarList>
              </Section>
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

/** Swap approvals. Two taps, per PRODUCT_BRIEF §6.1. */
function SwapQueue({
  swaps,
  onDecided,
}: {
  swaps: SwapRequestRecord[];
  onDecided(): void;
}): ReactNode {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED'): Promise<void> {
    setPending(id);
    setError(null);
    try {
      await api(`/roster/swaps/${id}/decide`, { method: 'POST', body: { decision } });
      onDecided();
    } catch {
      setError('Could not update swap request. Check your connection and try again.');
    } finally {
      setPending(null);
    }
  }

  if (swaps.length === 0) return null;

  return (
    <Section title="Swap requests">
      {error ? (
        <Callout tone="alert" role="alert" className="mb-sm">
          {error}
        </Callout>
      ) : null}
      <ul className="flex flex-col gap-sm">
        {swaps.map((swap) => (
          <Card as="li" variant="flat" key={swap.id}>
            <p>
              <strong>{swap.requesterName}</strong> <span aria-hidden="true">→</span>
              <span className="sr-only">wants to swap with</span> <strong>{swap.targetName}</strong>
            </p>
            <p className="text-caption text-text-muted">
              {swap.stationName} · {swap.date} · {blockWord(swap.block)}
              {swap.reason ? ` · ${swap.reason}` : ''}
            </p>

            <div className="mt-sm flex flex-wrap gap-sm">
              <Button
                disabled={pending === swap.id}
                onClick={() => void decide(swap.id, 'APPROVED')}
                aria-label={`Approve the swap from ${swap.requesterName} to ${swap.targetName}`}
              >
                Approve
              </Button>
              <Button
                variant="quiet"
                disabled={pending === swap.id}
                onClick={() => void decide(swap.id, 'REJECTED')}
                aria-label={`Reject the swap from ${swap.requesterName} to ${swap.targetName}`}
              >
                Reject
              </Button>
            </div>
          </Card>
        ))}
      </ul>
    </Section>
  );
}
