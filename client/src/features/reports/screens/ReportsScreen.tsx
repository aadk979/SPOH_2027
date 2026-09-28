'use client';

import type { ReactNode } from 'react';

import { AppShell } from '@/shared/shell/AppShell';
import { Button, Callout, LoadingCards, Stack } from '@/shared/ui';
import { useRequireSession } from '@/features/session';
import { useReport } from '@/features/reports';
import { useReportExport } from '../hooks/useReportExport';
import { ReportHeader } from '../components/ReportHeader';
import { IntegritySection } from '../components/IntegritySection';
import { ReportTotals } from '../components/ReportTotals';
import { RegistrationSection } from '../components/RegistrationSection';
import { FootfallSection } from '../components/FootfallSection';
import { CardSection } from '../components/CardSection';
import { GiftSection } from '../components/GiftSection';
import { SafetySection } from '../components/SafetySection';
import { VolunteerSection } from '../components/VolunteerSection';

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
export default function ReportsScreen(): ReactNode {
  const session = useRequireSession();
  const report = useReport(session !== null);
  const { downloading, exportError, download } = useReportExport();

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
          <ReportHeader data={data} />

          <IntegritySection data={data} />

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

          <ReportTotals data={data} />

          <div className="grid gap-lg lg:grid-cols-2">
            <RegistrationSection data={data} />

            <FootfallSection data={data} />

            <CardSection data={data} />

            <GiftSection data={data} />
          </div>

          <SafetySection data={data} />

          <VolunteerSection data={data} />
        </Stack>
      )}
    </AppShell>
  );
}
