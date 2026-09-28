import type { ReactNode } from 'react';
import type { FullReport } from '@spoh/shared';
import { Section, CardGrid } from '@/shared/ui';
import { StatTile } from '@/features/dashboard';
export function VolunteerSection({ data }: { data: FullReport }): ReactNode {
  return (
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
  );
}
