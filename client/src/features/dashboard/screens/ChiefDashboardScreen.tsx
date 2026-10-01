'use client';

import { AttentionPanel } from '../components/AttentionPanel';
import { StaffingPanel } from '../components/StaffingPanel';
import { GiftStockPanel } from '../components/GiftStockPanel';
import { CardFunnelPanel } from '../components/CardFunnelPanel';
import { RoomEntriesPanel } from '../components/RoomEntriesPanel';
import { ArrivalsPanel } from '../components/ArrivalsPanel';
import { TodayTotals } from '../components/TodayTotals';
import { RehearsalDashboardControl } from '../components/RehearsalDashboardControl';

import { useState, type ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { AppShell } from '@/shared/shell/AppShell';
import { ButtonLink, Callout, LoadingCards, Section, Stack } from '@/shared/ui';
import { useLiveDashboard } from '@/features/dashboard';
import { useRequireSession } from '@/features/session';

/**
 * The live operations dashboard (remediation/phases/P07-client-refactor.md).
 *
 * Built for glancing at while walking. The order is the order of urgency: what
 * is broken, then what is happening, then the numbers.
 *
 * There is no combined "total visitors" figure anywhere on this page. Every
 * count states its unit, because a registration, a room entry and a card
 * measure three different things and adding them produces a number that means
 * nothing.
 */
export default function ChiefDashboardScreen(): ReactNode {
  const session = useRequireSession();
  const [includeRehearsal, setIncludeRehearsal] = useState(false);
  const { data, isLoading, isError } = useLiveDashboard(includeRehearsal);

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
      <RehearsalDashboardControl included={includeRehearsal} onChange={setIncludeRehearsal} />
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
  return (
    <Stack>
      <AttentionPanel data={data} />

      <TodayTotals data={data} />

      {/*
        Two columns from `lg` up. These four bar panels are the bulk of the
        page, and stacked on a 1600px console they were four short charts in a
        1600px-wide column with an enormous amount of scrolling between them.
      */}
      <div className="grid gap-lg lg:grid-cols-2">
        <ArrivalsPanel data={data} />

        <RoomEntriesPanel data={data} />

        <CardFunnelPanel data={data} />

        <GiftStockPanel data={data} />
      </div>

      <StaffingPanel data={data} />

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
