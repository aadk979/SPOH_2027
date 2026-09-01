'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { AppShell } from '@/components/AppShell';
import { BarRow, StatTile } from '@/components/dashboard/StatTile';
import { useRequireSession } from '@/features/session/useSession';
import { api } from '@/lib/api';
import { clientEnv } from '@/lib/env';
import { getAccessToken } from '@/lib/session';
import { readableCategory } from '../chief/page';

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
    } finally {
      setDownloading(null);
    }
  }

  if (!session) return null;

  const data = report.data;

  return (
    <AppShell title="Post-event report" back={{ href: '/home', label: 'Home' }}>
      {report.isLoading ? (
        <p style={{ color: 'var(--text-muted)' }}>Generating…</p>
      ) : !data ? (
        <p className="tile" style={{ color: 'var(--color-alert)' }}>
          The report could not be generated.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <section className="tile" style={{ borderLeft: '4px solid var(--color-primary)' }}>
            <h2 className="mb-2 font-semibold">How to read these numbers</h2>
            <p>{data.countingNote}</p>
          </section>

          {data.dataIntegrity.containsFallbackData ? (
            <section className="tile" style={{ borderLeft: '4px solid var(--color-warn)' }}>
              <h2 className="mb-2 font-semibold" style={{ color: 'var(--color-warn)' }}>
                This report contains data captured off-app
              </h2>
              <p>
                {data.dataIntegrity.degradedMinutes} minutes of degraded operation across{' '}
                {data.dataIntegrity.fallbackWindows.length} window
                {data.dataIntegrity.fallbackWindows.length === 1 ? '' : 's'}. Those periods are
                approximate.
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {data.dataIntegrity.fallbackWindows.map((window) => (
                  <li key={window.id}>
                    Tier {window.tier} · {window.stationName ?? 'Event-wide'} ·{' '}
                    {window.durationMinutes ?? '—'} min · {window.reason}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="pill"
              disabled={downloading !== null}
              onClick={() => void download('xlsx')}
            >
              {downloading === 'xlsx' ? 'Preparing…' : 'Download XLSX'}
            </button>
            <button
              type="button"
              className="pill-quiet"
              disabled={downloading !== null}
              onClick={() => void download('csv')}
            >
              {downloading === 'csv' ? 'Preparing…' : 'Download CSV'}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
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
          </div>

          <ReportSection title="Who came">
            {data.registrations.byCategory.map((row) => (
              <BarRow
                key={row.key}
                label={readableCategory(row.key)}
                value={row.value}
                max={Math.max(1, ...data.registrations.byCategory.map((r) => r.value))}
              />
            ))}
          </ReportSection>

          <ReportSection title="Room entries and peak periods">
            {data.footfall.byStation.map((row) => (
              <div key={row.stationId}>
                <BarRow
                  label={row.stationName}
                  value={row.total}
                  max={Math.max(1, ...data.footfall.byStation.map((s) => s.total))}
                />
                {row.peakBlockStart ? (
                  <p className="ml-40 text-sm" style={{ color: 'var(--text-muted)' }}>
                    Busiest 30 minutes: {formatTime(row.peakBlockStart)} · {row.peakBlockValue}{' '}
                    entries
                  </p>
                ) : null}
              </div>
            ))}
          </ReportSection>

          <ReportSection title="Mission Card funnel">
            {data.cards.byStation.map((row) => (
              <BarRow
                key={row.stationId}
                label={row.stationName}
                value={row.cards}
                max={Math.max(1, data.cards.issued)}
              />
            ))}
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              Issued and completed are shown by day in the export. They do not have to match: a card
              issued on one day may be completed on another, because visitors keep their card and
              return.
            </p>
          </ReportSection>

          <ReportSection title="Gifts">
            {data.gifts.byGiftType.map((row) => (
              <BarRow
                key={row.giftTypeId}
                label={row.giftTypeName}
                value={row.redeemed}
                max={Math.max(1, ...data.gifts.byGiftType.map((g) => g.redeemed))}
              />
            ))}
          </ReportSection>

          <section>
            <SectionHeading>Safety</SectionHeading>
            <div className="grid gap-3 sm:grid-cols-3">
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
            </div>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              Lost-person descriptions are deleted once a case is resolved. Only timings and
              outcomes are kept.
            </p>
          </section>

          <section>
            <SectionHeading>Volunteers</SectionHeading>
            <div className="grid gap-3 sm:grid-cols-3">
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
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section>
      <SectionHeading>{title}</SectionHeading>
      <div className="tile flex flex-col gap-2">{children}</div>
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-SG', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  });
}
