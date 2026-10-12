import type { ReactNode } from 'react';
import type { LiveDashboardResponse } from '@spoh/shared';
import { CardGrid, Section } from '@/shared/ui';
import { HeadlineTile, StatTile } from '@/features/dashboard';
import { registrationsLink, lastHourLink, countedRoomsLink, todayCardLink, headlineLink } from '../model/drillLinks';
export function TodayTotals({ data }: { data: LiveDashboardResponse }): ReactNode {
  return (
    <Section title={`Today — ${data.eventDayLabel ?? 'not an event day'}`}>
      <HeadlineTile headline={data.headline} href={headlineLink(data.headline, data.observation)} />
      <CardGrid>
        <StatTile
          label="Registered"
          href={registrationsLink(data.observation)}
          noteHref={lastHourLink(data.observation)}
          value={data.registrations.todayTotal}
          unit="registrations"
          note={`${data.registrations.lastHour} in the last hour`}
        />
        <StatTile
          label="Room entries"
          href={countedRoomsLink(data.observation)}
          value={data.footfall.todayTotal}
          unit="room entries — not people"
        />
        <StatTile
          label="Cards issued"
          href={todayCardLink(data.observation, 'issued')}
          noteHref={todayCardLink(data.observation, 'completed')}
          value={data.cards.issued}
          unit="cards — a card can be a family"
          note={`${data.cards.completed} completed`}
        />
      </CardGrid>
    </Section>
  );
}
