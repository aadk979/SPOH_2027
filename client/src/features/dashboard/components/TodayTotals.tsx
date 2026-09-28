import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { CardGrid, Section } from '@/shared/ui';
import { StatTile } from '@/features/dashboard';
export function TodayTotals({ data }: { data: LiveDashboardResponse }): ReactNode {
  return (
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
  );
}
