'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { BarList, BarRow, StatTile } from '@/components/dashboard/StatTile';
import {
  Button,
  Callout,
  Card,
  CardGrid,
  CardTitle,
  LoadingCards,
  Section,
  Stack,
} from '@/components/ui';
import { useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';
import { clientEnv } from '@/lib/env';
import { formatTime, readableCategory } from '@/lib/format';
import { getAccessToken } from '@/lib/session';

/**
 * The post-event report (PRODUCT_BRIEF §10).
 *
 * Everything the deck asks each IC to consolidate, generated rather than
 * assembled, with a one-click export for the Lead (Comms & Outreach).
 *
 * The counting note is rendered first and prominently. The single most likely
 * misuse of this page is somebody adding the registration total to the
 * room-entry total, and the cheapest place to prevent that is above the
 * numbers rather than in a footnote.
 */
export default function ReportsPage(): ReactNode {
  const session = useRequireSession();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: () => api<FullReport>('/reports/summary'),
    enabled: session !== null,
    // The whole event in one query. Expensive, and it does not change while
    // somebody is reading it.
    staleTime: 60_000,
  });

  /**
   * Fetched with the bearer token and saved from a blob rather than linked.
   * A plain anchor cannot carry the Authorization header, and putting the token
   * in a query string would write a credential into every access log between
   * here and the server.
   */
  async function download(format: 'xlsx' | 'csv'): Promise<void> {
    setDownloading(format);
    setExportError(null);

    try {
      const response = await fetch(
        `${clientEnv.apiBaseUrl}/api/v1/reports/export?format=${format}`,
        { headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` } },
      );

      if (!response.ok) throw new Error(String(response.status));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = `spoh2027-report-${new Date().toISOString().slice(0, 10)}.${format}`;
      anchor.click();

      URL.revokeObjectURL(url);
    } catch {
      // Silence here used to look identical to a browser that had blocked the
      // download — the Lead would tap twice more and then ask whether the
      // report existed at all.
      setExportError(
        `The ${format.toUpperCase()} could not be generated. Try again, or take the figures from this page.`,
      );
    } finally {
      setDownloading(null);
    }
  }

  if (!session) return null;

  const data = report.data;

  return (
    <AppShell width="wide" title="Post-event report" back={{ href: '/home', label: 'Home' }}>
      {report.isLoading ? (
        <LoadingCards count={3} label="Generating the report" />
      ) : !data ? (
        <Callout tone="alert" title="The report could not be generated">
          Try again in a moment. The underlying data is unaffected.
        </Callout>
      ) : (
        <Stack>
          <Card tone="info">
            <CardTitle>How to read these numbers</CardTitle>
            {/* The single most-misread thing in the system; it gets the pace. */}
            <p className="mt-xs text-reading">{data.countingNote}</p>
          </Card>

          {data.dataIntegrity.containsFallbackData ? (
            <Card tone="warn">
              <CardTitle>This report contains data captured off-app</CardTitle>
              <p className="mt-xs">
                {data.dataIntegrity.degradedMinutes} minutes of degraded operation across{' '}
                {data.dataIntegrity.fallbackWindows.length} window
                {data.dataIntegrity.fallbackWindows.length === 1 ? '' : 's'}. Those periods are
                approximate.
              </p>
              <ul className="mt-xs flex flex-col gap-xxs text-caption text-text-muted">
                {data.dataIntegrity.fallbackWindows.map((window) => (
                  <li key={window.id}>
                    Tier {window.tier} · {window.stationName ?? 'Event-wide'} ·{' '}
                    {window.durationMinutes ?? '—'} min · {window.reason}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-sm">
            <Button disabled={downloading !== null} onClick={() => void download('xlsx')}>
              {downloading === 'xlsx' ? 'Preparing…' : 'Download XLSX'}
            </Button>
            <Button
              variant="quiet"
              disabled={downloading !== null}
              onClick={() => void download('csv')}
            >
              {downloading === 'csv' ? 'Preparing…' : 'Download CSV'}
            </Button>
          </div>

          {exportError ? (
            <Callout tone="alert" role="alert">
              {exportError}
            </Callout>
          ) : null}

          <CardGrid>
            <StatTile
              label="Registrations"
              value={data.registrations.total}
              unit="people who signed up"
              note={`${data.registrations.voided} voided and excluded`}
            />
            <StatTile
              label="Room entries"
              value={data.footfall.total}
              unit="entries, not unique visitors"
            />
            <StatTile
              label="Cards issued"
              value={data.cards.issued}
              unit="journeys, not people"
              note={`${(data.cards.completionRate * 100).toFixed(1)}% completed`}
            />
          </CardGrid>

          <div className="grid gap-lg lg:grid-cols-2">
            <Section title="Who came">
              <BarList>
                {data.registrations.byCategory.length === 0 ? (
                  <p className="text-text-muted">Nothing recorded.</p>
                ) : (
                  data.registrations.byCategory.map((row) => (
                    <BarRow
                      key={row.key}
                      label={readableCategory(row.key)}
                      value={row.value}
                      max={Math.max(
                        1,
                        ...data.registrations.byCategory.map((entry) => entry.value),
                      )}
                    />
                  ))
                )}
              </BarList>
            </Section>

            <Section title="Room entries and peak periods">
              <BarList>
                {data.footfall.byStation.length === 0 ? (
                  <p className="text-text-muted">Nothing recorded.</p>
                ) : (
                  data.footfall.byStation.map((row) => (
                    <div key={row.stationId}>
                      <BarRow
                        label={row.stationName}
                        value={row.total}
                        max={Math.max(1, ...data.footfall.byStation.map((entry) => entry.total))}
                      />
                      {row.peakBlockStart ? (
                        // Under its own bar, not at a fixed 160px indent that
                        // landed under the neighbouring station on a phone.
                        <p className="mt-xxs text-caption text-text-muted">
                          Busiest 30 minutes: {formatTime(row.peakBlockStart)} ·{' '}
                          {row.peakBlockValue} entries
                        </p>
                      ) : null}
                    </div>
                  ))
                )}
              </BarList>
            </Section>

            <Section
              title="Mission Card funnel"
              description="Issued and completed do not have to match: a card issued on one day may be completed on another, because visitors keep their card and return."
            >
              <BarList>
                {data.cards.byStation.length === 0 ? (
                  <p className="text-text-muted">Nothing recorded.</p>
                ) : (
                  data.cards.byStation.map((row) => (
                    <BarRow
                      key={row.stationId}
                      label={row.stationName}
                      value={row.cards}
                      max={Math.max(1, data.cards.issued)}
                    />
                  ))
                )}
              </BarList>
            </Section>

            <Section title="Gifts">
              <BarList>
                {data.gifts.byGiftType.length === 0 ? (
                  <p className="text-text-muted">Nothing recorded.</p>
                ) : (
                  data.gifts.byGiftType.map((row) => (
                    <BarRow
                      key={row.giftTypeId}
                      label={row.giftTypeName}
                      value={row.redeemed}
                      max={Math.max(1, ...data.gifts.byGiftType.map((entry) => entry.redeemed))}
                    />
                  ))
                )}
              </BarList>
            </Section>
          </div>

          <Section
            title="Safety"
            description="Lost-person descriptions are deleted once a case is resolved. Only timings and outcomes are kept."
          >
            <CardGrid>
              <StatTile
                label="Incidents"
                value={data.safety.incidents.length}
                unit="reported"
                note={`${data.safety.nearMisses} near misses`}
              />
              <StatTile
                label="Lost person"
                value={data.safety.lostPerson.cases}
                unit="cases"
                note={
                  data.safety.lostPerson.medianResolutionMinutes === null
                    ? 'none'
                    : `median ${data.safety.lostPerson.medianResolutionMinutes} min`
                }
              />
              <StatTile
                label="Lost and found"
                value={data.safety.lostAndFound.logged}
                unit="items logged"
                note={`${data.safety.lostAndFound.claimed} claimed`}
              />
            </CardGrid>
          </Section>

          <Section title="Volunteers">
            <CardGrid>
              <StatTile
                label="Shift assignments"
                value={data.volunteers.assignments}
                unit="across the event"
              />
              <StatTile
                label="No-shows"
                value={data.volunteers.noShows}
                unit={`${(data.volunteers.noShowRate * 100).toFixed(1)}% of assignments`}
                tone={data.volunteers.noShowRate > 0.1 ? 'warn' : 'neutral'}
              />
              <StatTile
                label="Volunteer hours"
                value={data.volunteers.totalHours}
                unit="check-in to check-out"
              />
            </CardGrid>
          </Section>
        </Stack>
      )}
    </AppShell>
  );
}
